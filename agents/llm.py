"""One wrapper for every LLM call in Crux.

All agent roles (proposer, designer, predictor, referee, critic, reporter) call the model
through :class:`LLM`. It implements the ``LLM`` protocol from ``core/interfaces.py``::

    results = await llm.structured("predictor", MySchema, messages, n=8)

What it does:

* **Structured outputs.** Each call is parsed into the given pydantic schema with the SDK's
  parse helper. The helper is detected once per client, in this order:
  ``client.responses.parse(text_format=...)``,
  ``client.chat.completions.parse(response_format=...)``,
  ``client.beta.chat.completions.parse(response_format=...)``. Refusals, truncated output and
  schema violations raise :class:`LLMOutputError` naming the role, model and sample index.
* **n independent samples.** ``n`` samples are separate API calls run in parallel, bounded by
  one semaphore (``max_concurrency``) shared by every call on the instance. Results come back
  in sample-index order.
* **Per-role model and temperature.** Looked up in :class:`LLMConfig`; unknown roles use the
  ``"default"`` entry. If a model rejects ``temperature`` (most reasoning models do), the call
  is retried once without it and the model is remembered so later calls omit it.
* **Disk cache.** Keyed by sha256 over model, role, messages, schema name and JSON schema,
  sample index and temperature. A hit makes no network call (no API key is needed for a fully
  cached run) and reports ``Usage(cached=True, cost_usd=0)``.
* **Retries.** Rate limits, timeouts, connection errors and 5xx are retried up to
  ``max_retries`` times with exponential backoff and jitter. Other 4xx errors propagate at
  once. The SDK's own retries are disabled on the client this module creates.
* **Usage accounting.** Every sample produces a :class:`Usage` (tokens, cost from
  ``prices_per_mtok`` or ``None`` when the model has no price, wall time) that is passed to
  ``on_usage`` and summed into :meth:`LLM.usage_totals`.
* **Optional tracing.** A run-scoped background exporter records generations in Langfuse
  and optionally local Phoenix. Inference uses the plain OpenAI client: exporter failures
  cannot discard or repeat a paid response. Every record carries role, step and run id.

Configuration (:class:`LLMConfig`; ``core/config.py`` imports and overrides it):

* ``role_models``: role -> model name; must contain ``"default"``.
* ``role_temperature``: role -> temperature; ``"default"`` is the fallback.
* ``prices_per_mtok``: model -> (input $/1M tokens, output $/1M tokens).
* ``cache`` / ``cache_dir``: enable the disk cache and choose its directory (default
  ``runs/.cache/llm``, or ``$CRUX_LLM_CACHE_DIR`` when set).
* ``max_concurrency``: maximum in-flight API calls per :class:`LLM` instance.
* ``max_retries``: retries after the first attempt for transient errors.
* ``timeout_s``: per-request timeout of the client this module creates.

Model names live only in configuration. The defaults are the two constants
``CHEAP_MODEL`` and ``STRONG_MODEL`` below; no other code should name a model.
"""

from __future__ import annotations

import asyncio
import contextlib
import contextvars
import hashlib
import json
import logging
import os
import random
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal, TypeVar

import openai
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from core.tracing import current_run

logger = logging.getLogger(__name__)

# --- Default models: the only place model names appear. -------------------------------
CHEAP_MODEL = "gpt-4.1-mini"  # fast, non-reasoning: honours temperature, returns logprobs
STRONG_MODEL = "gpt-5.5"  # reasoning model: rejects temperature, which is handled below

BACKOFF_BASE_S = 1.0
BACKOFF_MAX_S = 30.0

T = TypeVar("T", bound=BaseModel)
ApiPath = Literal["responses", "chat", "beta_chat"]

_RETRYABLE: tuple[type[Exception], ...] = (
    openai.RateLimitError,
    openai.APITimeoutError,
    openai.APIConnectionError,
    openai.InternalServerError,
)
_OUTPUT_ERRORS: tuple[type[Exception], ...] = (
    ValidationError,
    openai.LengthFinishReasonError,
    openai.ContentFilterFinishReasonError,
)
_METADATA_MAX_KEYS = 16
_METADATA_MAX_VALUE = 512

# Indirection so tests can make backoff instantaneous.
_sleep = asyncio.sleep
_tracing_warned = False


def _default_role_models() -> dict[str, str]:
    return {
        "proposer": CHEAP_MODEL,
        "predictor": CHEAP_MODEL,
        "designer": STRONG_MODEL,
        "referee": STRONG_MODEL,
        "critic": STRONG_MODEL,
        "reporter": STRONG_MODEL,
        "default": CHEAP_MODEL,
    }


def _default_role_temperature() -> dict[str, float]:
    return {"predictor": 0.8, "proposer": 0.7, "default": 0.2}


# The evaluation runner sets this per run, so repeats of one case never replay each other's
# cached answers. Unset, every run shares ``runs/.cache/llm`` as before.
CACHE_DIR_ENV = "CRUX_LLM_CACHE_DIR"


def _default_cache_dir() -> Path:
    return Path(os.environ.get(CACHE_DIR_ENV) or "runs/.cache/llm")


class LLMConfig(BaseModel):
    """Settings for :class:`LLM`. See the module docstring for the meaning of each field."""

    model_config = ConfigDict(extra="forbid")

    role_models: dict[str, str] = Field(default_factory=_default_role_models)
    role_temperature: dict[str, float] = Field(default_factory=_default_role_temperature)
    prices_per_mtok: dict[str, tuple[float, float]] = Field(default_factory=dict)
    cache: bool = True
    cache_dir: Path = Field(default_factory=_default_cache_dir)
    max_concurrency: int = Field(8, ge=1)
    max_retries: int = Field(3, ge=0)
    timeout_s: float = Field(120.0, gt=0)

    @model_validator(mode="after")
    def _require_default_model(self) -> LLMConfig:
        if "default" not in self.role_models:
            raise ValueError('role_models must contain a "default" entry')
        return self

    def model_for(self, role: str) -> str:
        return self.role_models.get(role, self.role_models["default"])

    def temperature_for(self, role: str) -> float | None:
        """Temperature for ``role``; ``None`` means the provider default (nothing is sent)."""
        return self.role_temperature.get(role, self.role_temperature.get("default"))


class Usage(BaseModel):
    """Accounting for one sample (one API call, or one cache hit)."""

    role: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    cached: bool
    seconds: float


class LLMOutputError(RuntimeError):
    """The model returned no usable structured output (refusal, truncation, schema violation)."""

    def __init__(self, message: str, *, role: str, model: str, sample_index: int) -> None:
        self.role = role
        self.model = model
        self.sample_index = sample_index
        super().__init__(f"{message} (role={role}, model={model}, sample={sample_index})")


def cache_key(
    *,
    model: str,
    role: str,
    messages: list[dict],
    schema: type[BaseModel],
    sample_index: int,
    temperature: float | None,
) -> str:
    """sha256 over a canonical JSON encoding of everything that determines a sample."""
    payload = {
        "model": model,
        "role": role,
        "messages": messages,
        "schema_name": schema.__name__,
        "schema": schema.model_json_schema(),
        "sample_index": sample_index,
        "temperature": None if temperature is None else float(temperature),
    }
    blob = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class LLM:
    """Structured, cached, retried, rate-limited access to the model for every agent role."""

    def __init__(
        self,
        config: LLMConfig | None = None,
        client: Any = None,
        on_usage: Callable[[Usage], None] | None = None,
        trace_tags: dict | None = None,
    ) -> None:
        self.config = config if config is not None else LLMConfig()
        self.on_usage = on_usage
        self._usage_hook = contextvars.ContextVar(f"llm_usage_{id(self)}", default=None)
        self.trace_tags = dict(trace_tags or {})
        # An injected client is used as-is (its own retry and timeout settings apply).
        # Otherwise the client is created on the first cache miss, so cached runs need no key.
        self._client: Any = client
        self._api: ApiPath | None = _detect_api(client) if client is not None else None
        self._tracing = False
        self._send_metadata = True
        self._no_temperature: set[str] = set()
        self._sem: asyncio.Semaphore | None = None
        self._sem_loop: asyncio.AbstractEventLoop | None = None
        self._totals: dict[str, float | int] = {
            "calls": 0,
            "cached_calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
            "unpriced_calls": 0,
        }

    # --- public API -------------------------------------------------------------------

    async def structured(
        self,
        role: str,
        schema: type[T],
        messages: list[dict],
        n: int = 1,
        *,
        temperature: float | None = None,
        step: str | None = None,
    ) -> list[T]:
        """Return ``n`` independent samples parsed into ``schema``, in sample-index order.

        ``temperature`` overrides the role's configured temperature. ``step`` is a free-form
        label used in logs and trace metadata. If any sample fails, the remaining in-flight
        samples are cancelled and the error propagates.
        """
        if n < 1:
            raise ValueError(f"n must be >= 1, got {n}")
        model = self.config.model_for(role)
        temp = temperature if temperature is not None else self.config.temperature_for(role)
        tasks = [
            asyncio.ensure_future(self._sample(role, model, schema, messages, i, temp, step))
            for i in range(n)
        ]
        try:
            return list(await asyncio.gather(*tasks))
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

    def usage_totals(self) -> dict:
        """Running totals: calls, cached_calls, input_tokens, output_tokens, cost_usd.

        Cache hits count as calls with zero tokens and zero cost. ``unpriced_calls`` counts
        API calls whose model has no entry in ``prices_per_mtok`` (their cost is excluded).
        """
        return dict(self._totals)

    def bind_usage(self, callback):
        token = self._usage_hook.set(callback)
        return lambda: self._usage_hook.reset(token)

    # --- one sample ---------------------------------------------------------------------

    async def _sample(
        self,
        role: str,
        model: str,
        schema: type[T],
        messages: list[dict],
        index: int,
        temperature: float | None,
        step: str | None,
    ) -> T:
        start = time.perf_counter()
        session = current_run.get()
        stage = str(session.step()) if session else step
        prompt_hash = hashlib.sha256(
            json.dumps(
                messages,
                sort_keys=True,
                ensure_ascii=False,
                default=str,
            ).encode()
        ).hexdigest()

        def trace(output, usage, error=None):
            if session is not None:
                try:
                    session.record(
                        role=role,
                        model=model,
                        prompt_sha256=prompt_hash,
                        messages=messages,
                        output=output,
                        usage=usage,
                        error=error,
                        step=stage,
                    )
                except Exception:  # noqa: BLE001 - telemetry must not discard a paid response
                    logger.warning("local telemetry record failed; inference continues")

        path: Path | None = None
        if self.config.cache:
            key = cache_key(
                model=model,
                role=role,
                messages=messages,
                schema=schema,
                sample_index=index,
                temperature=temperature,
            )
            path = Path(self.config.cache_dir) / key[:2] / f"{key}.json"
            hit = _cache_read(path, schema)
            if hit is not None:
                trace(hit.model_dump(mode="json"), {"cached": True, "cost_usd": 0.0})
                self._record(
                    Usage(
                        role=role,
                        model=model,
                        input_tokens=0,
                        output_tokens=0,
                        cost_usd=0.0,
                        cached=True,
                        seconds=time.perf_counter() - start,
                    )
                )
                return hit

        try:
            response = await self._call_with_retries(
                role, model, schema, messages, index, temperature, step
            )
        except BaseException as exc:
            trace(None, {}, type(exc).__name__)
            raise
        input_tokens, output_tokens = _token_counts(getattr(response, "usage", None))
        usage = Usage(
            role=role,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=self._cost(model, input_tokens, output_tokens),
            cached=False,
            seconds=time.perf_counter() - start,
        )
        try:
            parsed = self._extract(response, schema, role, model, index)
        except LLMOutputError:
            trace(None, usage.model_dump(), "LLMOutputError")
            self._record(usage)  # the tokens were still billed
            raise
        trace(parsed.model_dump(mode="json"), usage.model_dump())
        if path is not None:
            _cache_write(path, parsed, usage)
        self._record(usage)
        return parsed

    async def _call_with_retries(
        self,
        role: str,
        model: str,
        schema: type[BaseModel],
        messages: list[dict],
        index: int,
        temperature: float | None,
        step: str | None,
    ) -> Any:
        attempt = 0
        while True:
            send_temperature = temperature is not None and model not in self._no_temperature
            metadata = (
                self._trace_metadata(role, step) if self._tracing and self._send_metadata else None
            )
            try:
                async with self._semaphore():
                    return await self._invoke(
                        model,
                        schema,
                        messages,
                        temperature if send_temperature else None,
                        metadata,
                    )
            except openai.BadRequestError as exc:
                if send_temperature and _is_temperature_rejection(exc):
                    self._drop_temperature(model)
                    continue
                if metadata and "metadata" in str(exc).lower():
                    self._drop_metadata(exc)
                    continue
                raise
            except _RETRYABLE as exc:
                if attempt >= self.config.max_retries or _is_quota_error(exc):
                    raise
                delay = _backoff_delay(attempt, _retry_after_s(exc))
                attempt += 1
                logger.warning(
                    "LLM %s/%s sample %d: %s; retry %d/%d in %.1fs",
                    role,
                    model,
                    index,
                    type(exc).__name__,
                    attempt,
                    self.config.max_retries,
                    delay,
                )
                await _sleep(delay)
            except _OUTPUT_ERRORS as exc:
                raise LLMOutputError(
                    f"structured output failed: {type(exc).__name__}: {_short(exc)}",
                    role=role,
                    model=model,
                    sample_index=index,
                ) from exc
            except openai.OpenAIError:
                raise
            except TypeError as exc:
                if metadata and "metadata" in str(exc):
                    self._drop_metadata(exc)
                    continue
                raise

    async def _invoke(
        self,
        model: str,
        schema: type[BaseModel],
        messages: list[dict],
        temperature: float | None,
        metadata: dict[str, str] | None,
    ) -> Any:
        client = self._ensure_client()
        kwargs: dict[str, Any] = {"model": model}
        if temperature is not None:
            kwargs["temperature"] = temperature
        if metadata:
            kwargs["metadata"] = metadata
        if self._api == "responses":
            return await client.responses.parse(
                input=messages, text_format=schema, store=False, **kwargs
            )
        completions = (
            client.chat.completions if self._api == "chat" else client.beta.chat.completions
        )
        return await completions.parse(messages=messages, response_format=schema, **kwargs)

    def _extract(self, response: Any, schema: type[T], role: str, model: str, index: int) -> T:
        if self._api == "responses":
            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                raise LLMOutputError(
                    _responses_failure(response),
                    role=role,
                    model=model,
                    sample_index=index,
                )
        else:
            choices = getattr(response, "choices", None) or []
            if not choices:
                raise LLMOutputError(
                    "response has no choices",
                    role=role,
                    model=model,
                    sample_index=index,
                )
            message = choices[0].message
            refusal = getattr(message, "refusal", None)
            if refusal:
                raise LLMOutputError(
                    f"model refused: {refusal}",
                    role=role,
                    model=model,
                    sample_index=index,
                )
            parsed = getattr(message, "parsed", None)
            if parsed is None:
                raise LLMOutputError(
                    f"no structured output (finish_reason={choices[0].finish_reason})",
                    role=role,
                    model=model,
                    sample_index=index,
                )
        try:
            return _coerce(parsed, schema)
        except ValidationError as exc:
            raise LLMOutputError(
                f"output does not match {schema.__name__}: {_short(exc)}",
                role=role,
                model=model,
                sample_index=index,
            ) from exc

    # --- helpers --------------------------------------------------------------------------

    def _ensure_client(self) -> Any:
        if self._client is None:
            self._client, self._tracing = _make_default_client(self.config.timeout_s)
            self._api = _detect_api(self._client)
        return self._client

    def _semaphore(self) -> asyncio.Semaphore:
        # One semaphore per event loop, so an instance survives successive asyncio.run calls.
        loop = asyncio.get_running_loop()
        if self._sem is None or self._sem_loop is not loop:
            self._sem = asyncio.Semaphore(self.config.max_concurrency)
            self._sem_loop = loop
        return self._sem

    def _drop_temperature(self, model: str) -> None:
        if model not in self._no_temperature:
            self._no_temperature.add(model)
            logger.warning("model %s rejects temperature; omitting it from now on", model)

    def _drop_metadata(self, exc: BaseException) -> None:
        if self._send_metadata:
            self._send_metadata = False
            logger.warning(
                "trace metadata rejected (%s); calls continue without it",
                type(exc).__name__,
            )

    def _fallback_to_plain_client(self, exc: BaseException) -> None:
        logger.warning(
            "tracing client failed (%s); falling back to the plain OpenAI client",
            type(exc).__name__,
        )
        self._client = openai.AsyncOpenAI(max_retries=0, timeout=self.config.timeout_s)
        self._api = _detect_api(self._client)
        self._tracing = False

    def _trace_metadata(self, role: str, step: str | None) -> dict[str, str]:
        meta = {str(k): str(v) for k, v in self.trace_tags.items() if v is not None}
        meta["role"] = role
        if step:
            meta["step"] = step
        run_id = self.trace_tags.get("run_id")
        if run_id:
            meta["langfuse_session_id"] = str(run_id)
        items = list(meta.items())[-_METADATA_MAX_KEYS:]
        return {k[:64]: v[:_METADATA_MAX_VALUE] for k, v in items}

    def _cost(self, model: str, input_tokens: int, output_tokens: int) -> float | None:
        price = self.config.prices_per_mtok.get(model)
        if price is None:
            return None
        return (input_tokens * price[0] + output_tokens * price[1]) / 1_000_000

    def _record(self, usage: Usage) -> None:
        totals = self._totals
        totals["calls"] += 1
        if usage.cached:
            totals["cached_calls"] += 1
        totals["input_tokens"] += usage.input_tokens
        totals["output_tokens"] += usage.output_tokens
        if usage.cost_usd is None:
            totals["unpriced_calls"] += 1
        else:
            totals["cost_usd"] += usage.cost_usd
        callback = self._usage_hook.get() or self.on_usage
        if callback is not None:
            # Exceptions propagate on purpose: a budget hook may stop the run.
            callback(usage)


# --- module-level helpers -------------------------------------------------------------------


def _detect_api(client: Any) -> ApiPath:
    """Pick the structured-output helper the client supports, newest first."""
    responses = getattr(client, "responses", None)
    if callable(getattr(responses, "parse", None)):
        return "responses"
    chat = getattr(getattr(client, "chat", None), "completions", None)
    if callable(getattr(chat, "parse", None)):
        return "chat"
    beta = getattr(getattr(getattr(client, "beta", None), "chat", None), "completions", None)
    if callable(getattr(beta, "parse", None)):
        return "beta_chat"
    raise TypeError(
        "client has no structured-output parse helper "
        "(responses.parse, chat.completions.parse or beta.chat.completions.parse)"
    )


def _make_default_client(timeout_s: float) -> tuple[Any, bool]:
    """Return ``(client, tracing_enabled)``; the SDK's own retries are disabled."""
    global _tracing_warned
    if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
        try:
            # Explicit generation exports are isolated in core.tracing. Importing
            # langfuse.openai monkey-patches inference globally and can throw *after*
            # a paid response, so it must not be used for fail-open inference.
            import langfuse  # noqa: F401
        except Exception as exc:  # noqa: BLE001 - tracing must never break a run
            if not _tracing_warned:
                _tracing_warned = True
                logger.warning(
                    "Langfuse tracing unavailable (%s); using the plain OpenAI client",
                    type(exc).__name__,
                )
    return openai.AsyncOpenAI(max_retries=0, timeout=timeout_s), False


def _coerce[T: BaseModel](parsed: Any, schema: type[T]) -> T:
    if isinstance(parsed, schema):
        return parsed
    if isinstance(parsed, BaseModel):
        return schema.model_validate(parsed.model_dump())
    if isinstance(parsed, (str, bytes)):
        return schema.model_validate_json(parsed)
    return schema.model_validate(parsed)


def _responses_failure(response: Any) -> str:
    for item in getattr(response, "output", None) or []:
        for content in getattr(item, "content", None) or []:
            if getattr(content, "type", None) == "refusal":
                return f"model refused: {getattr(content, 'refusal', '')}"
    details = getattr(response, "incomplete_details", None)
    if details is not None:
        return f"response incomplete ({getattr(details, 'reason', details)})"
    return f"no structured output in response (status={getattr(response, 'status', None)})"


def _token_counts(usage: Any) -> tuple[int, int]:
    """(input, output) tokens from a Responses or Chat Completions usage object."""
    if usage is None:
        return 0, 0
    input_tokens = getattr(usage, "input_tokens", None)
    if input_tokens is None:
        input_tokens = getattr(usage, "prompt_tokens", 0)
    output_tokens = getattr(usage, "output_tokens", None)
    if output_tokens is None:
        output_tokens = getattr(usage, "completion_tokens", 0)
    return int(input_tokens or 0), int(output_tokens or 0)


def _is_temperature_rejection(exc: openai.BadRequestError) -> bool:
    if getattr(exc, "param", None) == "temperature":
        return True
    text = str(exc).lower()
    return "temperature" in text and any(
        word in text for word in ("unsupported", "not supported", "does not support")
    )


def _is_quota_error(exc: Exception) -> bool:
    """A 429 for an exhausted quota is permanent; retrying cannot help."""
    return getattr(exc, "code", None) == "insufficient_quota"


def _retry_after_s(exc: Exception) -> float | None:
    headers = getattr(getattr(exc, "response", None), "headers", None)
    if not headers:
        return None
    for name, scale in (("retry-after-ms", 0.001), ("retry-after", 1.0)):
        value = headers.get(name)
        if value is None:
            continue
        try:
            return max(0.0, float(value) * scale)
        except (TypeError, ValueError):
            continue
    return None


def _backoff_delay(attempt: int, retry_after: float | None = None) -> float:
    """Exponential backoff with jitter; honours a server ``retry-after`` hint."""
    ceiling = min(BACKOFF_MAX_S, BACKOFF_BASE_S * 2**attempt)
    delay = ceiling * (0.5 + 0.5 * random.random())
    if retry_after is not None:
        delay = max(delay, min(retry_after, 2 * BACKOFF_MAX_S))
    return delay


def _cache_read[T: BaseModel](path: Path, schema: type[T]) -> T | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.warning("cannot read LLM cache entry %s: %s", path.name, exc)
        return None
    try:
        return schema.model_validate(json.loads(raw)["output"])
    except (ValueError, KeyError, TypeError) as exc:  # ValidationError is a ValueError
        logger.warning("ignoring unusable LLM cache entry %s: %s", path.name, type(exc).__name__)
        return None


def _cache_write(path: Path, parsed: BaseModel, usage: Usage) -> None:
    """Write ``{"output", "usage"}`` atomically (temp file + replace). Failures only warn."""
    payload = {
        "output": parsed.model_dump(mode="json"),
        "usage": usage.model_dump(mode="json", exclude={"cached"}),
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, sort_keys=True)
            os.replace(tmp, path)
        except BaseException:
            with contextlib.suppress(OSError):
                os.unlink(tmp)
            raise
    except OSError as exc:
        logger.warning("cannot write LLM cache entry %s: %s", path.name, exc)


def _short(exc: BaseException, limit: int = 300) -> str:
    text = str(exc).replace("\n", " ")
    return text if len(text) <= limit else text[: limit - 3] + "..."
