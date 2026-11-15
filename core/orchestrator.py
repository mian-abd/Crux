"""The Crux run loop. Every hard rule lives here, never in a prompt.

``await run(lab, cfg, deps)`` drives one run end to end and returns its ``Report``:

1. ``run.started``, ``lab.profile()`` (``profile.done``), the reviewed lessons when
   ``Deps.lessons`` is set (``memory.recalled`` per reader), ``agents.propose`` and the option set
   of every question: exact duplicates merged (weights summed), priors normalised, and a
   "none of these" option ``<question>.h0`` with prior ``cfg.null_prior`` added.
2. Numeric labs (``lab.candidate_designs()`` returns a grid): a ``ParticleBelief`` over the
   model families, one EIG-chosen measurement per round, ``belief.updated`` and ``model.curves``
   after each, until one family reaches ``cfg.settle`` or the lab's measurement budget is spent.
3. Categorical questions, one round at a time, always on the open question with the highest
   impact x entropy: design, filter (two or more bins, unspent ``spec_hash``, search allowed,
   bins that separate two options), fill likelihoods, score by EIG per cost, run the best
   (or a random / the designer's first, per ``cfg.selection``), referee, Bayes-update, reject
   options below ``cfg.reject_below``, regenerate options on a surprise, and settle, mark robust
   or give up as unresolved.
4. ``lab.deliver``, the critic and up to ``cfg.max_critic_rounds`` delivery rounds, lessons, and
   ``agents.report``. ``run.finished`` is always the last event of a run that did not crash.

Memory (``Deps.memory``): the lab's profile, valid observations and rejections (as the
referee's objections), the critic's findings and lessons are written; the designer recalls
before each design and the critic before each review (``contract["recalled_evidence"]``).
Recalled records only reach prompts. They never update a belief, and a record the run
already holds is never counted twice.

Events go through ``core.events.EventBus`` (its async ``emit``), one line each in
``<cfg.runs_dir>/<run_id>/events.jsonl``; payloads are made JSON-safe with ``jsonable`` and the
type is checked against ``core.events.EVENT_TYPES``. The bus stamps ``ts`` with ``Deps.clock``,
so a fake clock gives byte-identical files.

Budget: ``budget.tick`` follows every model call (through ``Deps.llm.on_usage``) and every
experiment. The usage hook is synchronous, so it queues the tick; the queue is flushed in order
before the next event and, while a slow model call is in flight, by a background task.
``BudgetExhausted`` ends the run with status ``budget_exhausted`` and a report built from what
exists. Cancellation ends it with status ``stopped``. Any other exception emits ``run.error``
and propagates.

Scoring goes through ``core.scoring`` (DU-6's ``core.eig`` when present, else the stand-in).
"""

from __future__ import annotations

import asyncio
import dataclasses
import hashlib
import json
import logging
import math
import random
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from core import events as E
from core import scoring
from core.budget import Budget, BudgetExhausted
from core.config import EngineConfig
from core.eig_exec import NULL_NAME, ModelFamily, ParticleBelief, as_designs
from core.events import EventBus, jsonable, new_run_id
from core.interfaces import AgentRoles, Executor, Lab, Memory, Predictor, Search
from core.manifest import RunManifest
from core.schemas import (
    BeliefUpdate,
    CriticFinding,
    EngineState,
    Evidence,
    Experiment,
    Hypothesis,
    Observation,
    Question,
    Report,
    Trial,
    bin_for,
)
from core.tracing import TraceSession, current_run

__all__ = ["Deps", "run", "spec_hash"]

logger = logging.getLogger(__name__)

RELEVANCE_TV = 0.05  # an experiment is relevant if two options' bin distributions differ this much
CONSISTENT_RATIO = 0.5  # consistent with an outcome: P(observed | h) >= CONSISTENT_RATIO / B
MAX_LOG_LINES = 200
MAX_LOG_CHARS = 500
DEFAULT_MEASUREMENTS = 10
MEMORY_K = 8
_SECRET = re.compile(r"\b(sk|pk|lf|exa)[-_][A-Za-z0-9_\-*]{6,}")  # key-shaped tokens in errors


@dataclass
class Deps:
    """What a run needs besides the lab and the config.

    ``llm`` is the ``agents.llm.LLM`` instance the agents share; the orchestrator sets its
    ``on_usage`` hook for the run so every model call is budgeted and ticked. ``bus_factory``
    is called as ``bus_factory(run_id, Path(cfg.runs_dir), clock=clock)`` and returns a
    ``core.events.EventBus`` (the default is the class itself). ``clock`` returns Unix seconds
    for event timestamps, budgets and latencies; tests pass a fake.

    ``lessons`` (``memory.lessons.RunLessons``, default ``None``) is a frozen, reviewed lesson
    corpus. When set, it is loaded after the profile and before any proposal, with one
    ``memory.recalled`` event per reader; the agents that share it read their lessons from it.
    """

    agents: AgentRoles
    predictor: Predictor
    executor: Executor | None = None
    memory: Memory | None = None
    search: Search | None = None
    llm: Any = None
    bus_factory: Callable[..., EventBus] = EventBus
    clock: Callable[[], float] = time.time
    lessons: Any = None


async def run(lab: Lab, cfg: EngineConfig, deps: Deps, *, run_id: str | None = None) -> Report:
    """Run ``lab`` under ``cfg`` and return the final report (see the module docstring)."""
    rid = run_id or new_run_id()
    bus = deps.bus_factory(rid, Path(cfg.runs_dir), clock=deps.clock)
    return await _Run(lab, cfg, deps, rid, bus).execute()


def spec_hash(exp: Experiment) -> str:
    """sha256 over the experiment's code, query, design and bins (canonical JSON)."""
    blob = json.dumps(
        {
            "code": exp.code,
            "query": exp.query,
            "design": exp.design,
            "bins": [b.model_dump(mode="json") for b in exp.bins],
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


async def _gather(*aws: Awaitable[Any]) -> list[Any]:
    """``asyncio.gather`` that cancels the siblings when one fails."""
    tasks = [asyncio.ensure_future(a) for a in aws]
    try:
        return list(await asyncio.gather(*tasks))
    except BaseException:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise


def _entropy(p: Any) -> float:
    return -sum(x * math.log2(x) for x in p if x > 0.0)


def _norm_statement(text: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", text.casefold()).split())


def _normalise(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0.0:
        return dict(weights)
    return {k: v / total for k, v in weights.items()}


def _clean_row(raw: Any, bins: list[str]) -> dict[str, float] | None:
    """A probability row over ``bins``; ``None`` when the row is unusable."""
    if not isinstance(raw, dict):
        return None
    vals = []
    for b in bins:
        try:
            v = float(raw.get(b, 0.0) or 0.0)
        except (TypeError, ValueError):
            v = 0.0
        vals.append(v if math.isfinite(v) and v > 0.0 else 0.0)
    total = sum(vals)
    if total <= 0.0:
        return None
    return {b: v / total for b, v in zip(bins, vals, strict=True)}


def _tv(p: dict[str, float], q: dict[str, float]) -> float:
    keys = set(p) | set(q)
    return 0.5 * sum(abs(p.get(k, 0.0) - q.get(k, 0.0)) for k in keys)


class _Run:
    """State and steps of one run. Created and executed by ``run``."""

    def __init__(self, lab: Lab, cfg: EngineConfig, deps: Deps, run_id: str, bus: EventBus) -> None:
        self.lab = lab
        self.cfg = cfg
        self.deps = deps
        self.run_id = run_id
        self.bus = bus
        self.run_dir = Path(cfg.runs_dir) / run_id
        self.clock = deps.clock
        self.budget = Budget(cfg.max_usd, cfg.max_llm_calls, cfg.max_seconds, clock=deps.clock)
        self.rng = random.Random(cfg.seed)
        self.state = EngineState(
            run_id=run_id,
            run_dir=self.run_dir.as_posix(),
            lab=getattr(lab, "name", "lab"),
        )
        self.belief: dict[str, dict[str, float]] = {}  # question -> active option -> probability
        self.null_of: dict[str, str] = {}  # question -> null hypothesis id
        self.n_runs: dict[str, int] = {}
        self.regens: dict[str, int] = {}
        self.spent: set[str] = set()
        self.exp_by_hash: dict[str, str] = {}
        self.lik_cache: dict[str, dict[str, dict[str, float]]] = {}
        self.lik_source: dict[str, str] = {}
        self.lik_declined: dict[str, set[str]] = {}  # spec hash -> options the predictor skipped
        self.emitted_rows: dict[str, tuple[str, ...]] = {}
        self._pending_rejects: list[tuple[str, str]] = []
        self.obs_evidence: dict[str, str] = {}
        self._ev_counter = 0
        self._finding_ids: set[str] = set()
        self._where = "start"
        self._started = False
        self._terminal = False
        self._report: Report | None = None
        self._stop_reason = ""
        self._restore_hook: Callable[[], None] | None = None
        self._emit_lock = asyncio.Lock()  # keeps queued ticks and other events in order
        self._pending_ticks: list[dict[str, Any]] = []
        self._flush_task: asyncio.Task[None] | None = None
        self.manifest = RunManifest(self.run_dir, run_id, cfg, lab, deps)
        self.tracing = TraceSession(run_id, lambda: self._where)

    # ------------------------------------------------------------------ lifecycle

    async def _start(self) -> None:
        config = self.cfg.model_dump(mode="json")
        config["llm"]["cache_dir"] = Path(self.cfg.llm.cache_dir).as_posix()  # same on every OS
        await self._emit(
            E.RUN_STARTED,
            lab=self.state.lab,
            goal=str(self.state.brief.get("goal", "")),
            config=config,
            started_at=datetime.fromtimestamp(self.clock(), tz=UTC).isoformat(),
        )
        self._started = True

    async def execute(self) -> Report:
        token = current_run.set(self.tracing)
        outcome = "error"
        try:
            self._install_usage_hook()
            self.manifest.start()
            try:
                self.state.brief = dict(self.lab.brief())
            except Exception:
                self._where = "brief"
                await self._start()  # the handler below then writes run.error
                raise
            await self._start()
            status = "ok"
            try:
                await self._main()
            except BudgetExhausted as exc:
                status = "budget_exhausted"
                self._stop_reason = exc.reason
            report = self._report if status == "ok" and self._report else self._fallback(status)
            await self._finish(report, status)
            outcome = status
            return report
        except asyncio.CancelledError:
            outcome = "stopped"
            if self._started and not self._terminal:
                self._stop_reason = "the run was cancelled"
                await self._finish(self._fallback("stopped"), "stopped")
            raise
        except Exception as exc:
            if self._started and not self._terminal:
                self._terminal = True
                message = _SECRET.sub("[redacted]", f"{type(exc).__name__}: {exc}")
                await self._emit(E.RUN_ERROR, message=message[:1000], where=self._where)
            raise
        finally:
            if self._restore_hook is not None:
                self._restore_hook()
            close = getattr(self.lab, "close", None)
            if callable(close):
                try:
                    result = close()
                    if asyncio.iscoroutine(result):
                        await result
                except Exception:  # closing must not mask the run's outcome
                    logger.exception("closing lab %s failed", self.state.lab)
            if self._flush_task is not None and not self._flush_task.done():
                self._flush_task.cancel()  # nothing is queued after the terminal event
            try:
                await self.tracing.flush()
            except Exception:  # telemetry cannot mask the run outcome
                logger.exception("tracing flush failed for %s", self.run_id)
            finally:
                current_run.reset(token)
                if self._started:
                    self.manifest.finish(outcome, self.tracing, self.budget.snapshot())

    async def _main(self) -> None:
        lab = self.lab
        bind = getattr(lab, "bind", None)
        if callable(bind):
            self._where = "bind"
            bind(self.run_id, self.run_dir, self.deps.executor)

        self._where = "profile"
        profile = [self._register_evidence(e) for e in await lab.profile()]
        await self._emit(E.PROFILE_DONE, evidence=profile)
        await self._memory_write(profile)

        if self.deps.lessons is not None:
            self._where = "lessons"
            await self._load_lessons()

        self._where = "propose"
        questions, hypotheses = await self.deps.agents.propose(self.state.brief, list(profile))
        await self._open_questions(list(questions), list(hypotheses))

        designs = lab.candidate_designs()
        for q in list(self.state.questions.values()):
            if q.kind == "model" and q.status == "open":
                await self._numeric_question(q, designs)
        await self._categorical_loop()

        await self._deliver_and_critique()
        await self._write_lessons()

        self.budget.check()
        self._where = "report"
        self.state.budget = self.budget.snapshot()
        report = await self.deps.agents.report(self.state, list(self.state.artifacts))
        self._report = self._enforce_report(report)

    async def _finish(self, report: Report, status: str) -> None:
        self._terminal = True
        await self._emit(E.RUN_FINISHED, report=report, status=status)

    # ------------------------------------------------------------------ events and budget

    async def _emit(self, type_: str, **payload: Any) -> None:
        """Write one event (after any queued ticks, so the file keeps call order)."""
        if type_ not in E.EVENT_TYPES:
            raise ValueError(f"unknown event type {type_!r}")
        async with self._emit_lock:
            await self._drain_ticks()
            if type_ == E.PROFILE_DONE:
                self.manifest.refresh_execution(self.lab, self.deps)
            if type_ == E.EXPERIMENT_STARTED:
                exp = self.state.experiments[payload["experiment_id"]]
                # Durable spec precedes both the event and lab.run().
                exp.spec_hash = spec_hash(exp)
                self.manifest.diagnostic(exp)
                payload["spec_hash"] = exp.spec_hash
            if type_ == E.ARTIFACT_WRITTEN:
                self.manifest.artifact(payload["artifact"])
            if type_ not in {E.EXPERIMENT_LOG, E.BUDGET_TICK}:
                qids = [payload["question_id"]] if "question_id" in payload else []
                exp = payload.get("experiment")
                if exp is not None:
                    qids.extend(exp.question_ids)
                targets = [*qids, payload.get("experiment_id", "")]
                refs = [
                    ref
                    for ref in self.tracing.refs
                    if any(t and ref["step"].endswith(f":{t}") for t in targets)
                ]
                refs = refs or self.tracing.refs[-3:]
                if refs:
                    payload["traces"] = refs
            await self.bus.emit(type_, jsonable(payload))

    async def _drain_ticks(self) -> None:
        """Emit the queued ``budget.tick`` payloads in order. Hold ``_emit_lock``."""
        while self._pending_ticks:
            await self.bus.emit(E.BUDGET_TICK, jsonable(self._pending_ticks.pop(0)))

    async def _flush_ticks(self) -> None:
        async with self._emit_lock:
            if self._terminal:  # the terminal event already wrote every queued tick
                self._pending_ticks.clear()
                return
            await self._drain_ticks()

    def _queue_tick(self) -> None:
        """Queue a tick from synchronous code; it is written before the next event, or
        sooner by a background flush when the loop is idle (a slow model call)."""
        snap = self.budget.snapshot()
        self.state.budget = snap
        self._pending_ticks.append(snap)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._flush_task is None or self._flush_task.done():
            self._flush_task = loop.create_task(self._flush_ticks())

    def _install_usage_hook(self) -> None:
        llm = self.deps.llm
        if llm is None or not hasattr(llm, "on_usage"):
            return
        previous = llm.on_usage

        def hook(usage: Any) -> None:
            if self._started and not self._terminal:
                self.manifest.usage(usage)
            if previous is not None:
                previous(usage)
            if self._terminal or not self._started:
                return
            self.budget.on_usage(usage)
            self._queue_tick()
            self.budget.check()

        if callable(getattr(llm, "bind_usage", None)):
            self._restore_hook = llm.bind_usage(hook)
            return
        llm.on_usage = hook

        def restore() -> None:
            llm.on_usage = previous

        self._restore_hook = restore

    async def _tick(self) -> None:
        snap = self.budget.snapshot()
        self.state.budget = snap
        await self._emit(E.BUDGET_TICK, **snap)

    # ------------------------------------------------------------------ evidence and memory

    def _new_evidence_id(self) -> str:
        while True:
            self._ev_counter += 1
            eid = f"ev-{self._ev_counter:03d}"
            if eid not in self.state.evidence:
                return eid

    def _register_evidence(self, ev: Evidence) -> Evidence:
        ev = ev.model_copy(deep=True)
        if not ev.id or (ev.id in self.state.evidence and self.state.evidence[ev.id] != ev):
            ev.id = self._new_evidence_id()
        self.state.evidence[ev.id] = ev
        return ev

    def _memory_on(self) -> bool:
        return self.deps.memory is not None

    def _memory_backend(self) -> str:
        return str(getattr(self.deps.memory, "backend", type(self.deps.memory).__name__))

    async def _memory_write(self, evidence: list[Evidence]) -> None:
        if not evidence or not self._memory_on():
            return
        memory = self.deps.memory
        assert memory is not None
        await _gather(*(memory.write(e, self.run_id, e.author_role) for e in evidence))
        backend = self._memory_backend()
        for e in evidence:
            await self._emit(
                E.MEMORY_WRITTEN,
                evidence_id=e.id,
                author_role=e.author_role,
                backend=backend,
            )

    async def _recall(self, reader_role: str, query: str) -> list[Evidence]:
        if not self._memory_on():
            return []
        memory = self.deps.memory
        assert memory is not None
        t0 = self.clock()
        found = await memory.recall(query, self.run_id, reader_role, k=MEMORY_K)
        latency_ms = max(self.clock() - t0, 0.0) * 1000.0
        seen: dict[str, Evidence] = {}
        for e in found:
            if self.cfg.memory == "local_role_only" and e.author_role != reader_role:
                continue
            seen.setdefault(e.id, e)
        recalled = list(seen.values())
        await self._emit(
            E.MEMORY_RECALLED,
            reader_role=reader_role,
            query=query,
            evidence_ids=[e.id for e in recalled],
            authors=[e.author_role for e in recalled],
            backend=self._memory_backend(),
            latency_ms=round(latency_ms, 3),
        )
        return recalled

    async def _load_lessons(self) -> None:
        """Recall the frozen lesson corpus for every reader before independent proposals.

        A failure to load or prepare it raises: the run fails rather than going on with no
        lessons. Lessons only reach prompts; they never touch beliefs or the run's memory.
        """
        audits = await self.deps.lessons.load(
            str(self.state.brief.get("goal", "")), self.run_dir / "lessons"
        )
        for audit in audits:
            await self._emit(
                E.MEMORY_RECALLED,
                reader_role=audit["reader_role"],
                query=audit["query"],
                evidence_ids=audit["evidence_ids"],
                authors=audit["authors"],
                backend=audit["backend"],
                latency_ms=round(audit["latency_ms"], 3),
                corpus_sha256=audit["corpus_sha256"],
                case_id=audit["case_id"],
            )

    def _context_evidence(self, recalled: list[Evidence]) -> list[Evidence]:
        """The run's evidence plus recalled records not already in it (never counted twice)."""
        out = dict(self.state.evidence)
        for e in recalled:
            out.setdefault(e.id, e)
        return list(out.values())

    # ------------------------------------------------------------------ questions and options

    async def _open_questions(
        self, questions: list[Question], hypotheses: list[Hypothesis]
    ) -> None:
        renamed: dict[str, str] = {}
        for q in questions:
            qid = q.id or f"q{len(self.state.questions) + 1}"
            base, n = qid, 1
            while qid in self.state.questions:
                n += 1
                qid = f"{base}-{n}"
            renamed.setdefault(q.id, qid)
            self.state.questions[qid] = q.model_copy(update={"id": qid, "status": "open"})
            self.n_runs[qid] = 0
            self.regens[qid] = 0
        by_question: dict[str, list[Hypothesis]] = {qid: [] for qid in self.state.questions}
        for h in hypotheses:
            qid = renamed.get(h.question_id)
            if qid is not None:
                by_question[qid].append(h)
        for qid, q in list(self.state.questions.items()):
            await self._emit(E.QUESTION_OPENED, question=q)
            await self._init_options(q, by_question[qid])

    def _unique_hyp_id(self, wanted: str, question_id: str) -> str:
        hid = wanted or f"{question_id}.opt"
        base, n = hid, 1
        while hid in self.state.hypotheses or (hid == NULL_NAME):
            n += 1
            hid = f"{base}-{n}"
        return hid

    async def _init_options(self, q: Question, proposals: list[Hypothesis]) -> None:
        props: list[Hypothesis] = []
        taken: set[str] = set()
        for h in proposals:
            h = h.model_copy(
                deep=True,
                update={
                    "question_id": q.id,
                    "status": "active",
                    "rejected_by": [],
                    "is_null": False,
                },
            )
            hid = h.id or f"{q.id}.opt"
            base, n = hid, 1
            while hid in self.state.hypotheses or hid in taken or hid == NULL_NAME:
                n += 1
                hid = f"{base}-{n}"
            h.id = hid
            taken.add(hid)
            props.append(h)

        with_null = self.cfg.null_hypothesis and self.cfg.null_prior > 0.0
        null_prior = self.cfg.null_prior if with_null else 0.0
        raw = {h.id: (h.prior if math.isfinite(h.prior) and h.prior > 0.0 else 1.0) for h in props}
        total = sum(raw.values()) or 1.0
        for h in props:
            h.prior = h.posterior = (1.0 - null_prior) * raw[h.id] / total

        null_h = None
        if with_null:
            null_h = Hypothesis(
                id=self._unique_hyp_id(f"{q.id}.h0", q.id),
                question_id=q.id,
                statement="None of these options",
                author="orchestrator",
                rationale="Catches outcomes that no proposed option predicts.",
                is_null=True,
                prior=null_prior,
                posterior=null_prior,
            )
        for h in props:
            await self._emit(E.HYPOTHESIS_PROPOSED, hypothesis=h)
        if null_h is not None:
            await self._emit(E.HYPOTHESIS_PROPOSED, hypothesis=null_h)

        groups: dict[str, list[Hypothesis]] = {}
        for h in props:
            groups.setdefault(_norm_statement(h.statement) or h.id, []).append(h)
        merges: list[tuple[str, list[str]]] = []
        for group in groups.values():
            keeper = group[0]
            if len(group) > 1:
                keeper.prior = keeper.posterior = sum(g.prior for g in group)
                merges.append((keeper.id, [g.id for g in group[1:]]))
            self.state.hypotheses[keeper.id] = keeper
        if null_h is not None:
            self.state.hypotheses[null_h.id] = null_h
            self.null_of[q.id] = null_h.id

        priors = {h.id: h.prior for h in self.state.options(q.id)}
        self.belief[q.id] = dict(priors)
        if merges:
            for kept, merged in merges:
                await self._emit(
                    E.HYPOTHESIS_MERGED,
                    question_id=q.id,
                    kept=kept,
                    merged=merged,
                    priors=priors,
                )
        else:
            await self._emit(
                E.HYPOTHESIS_MERGED, question_id=q.id, kept="", merged=[], priors=priors
            )

        if not self.state.options(q.id, include_null=False):
            await self._unresolve(q, "no options were proposed")
        elif q.kind == "categorical":
            await self._check_robust(q)

    def _active_real(self, qid: str) -> list[Hypothesis]:
        return self.state.options(qid, active_only=True, include_null=False)

    def _sync_posteriors(self, qid: str) -> None:
        for hid, p in self.belief[qid].items():
            self.state.hypotheses[hid].posterior = p

    async def _unresolve(self, q: Question, reason: str) -> None:
        q.status = "unresolved"
        top = sorted(
            self._active_real(q.id),
            key=lambda h: -self.belief.get(q.id, {}).get(h.id, 0),
        )
        await self._emit(
            E.QUESTION_UNRESOLVED,
            question_id=q.id,
            reason=reason,
            top=[h.id for h in top],
        )

    async def _check_robust(self, q: Question) -> bool:
        real = self._active_real(q.id)
        keys = [h.answer_key for h in real]
        if len(real) >= 2 and keys[0] is not None and all(k == keys[0] for k in keys):
            q.status = "robust"
            await self._emit(E.QUESTION_ROBUST, question_id=q.id, answer_key=keys[0])
            return True
        return False

    async def _check_closed(self, qid: str) -> None:
        q = self.state.questions[qid]
        if q.status != "open":
            return
        real = self._active_real(qid)
        if not real:
            await self._unresolve(q, "every option was rejected")
            return
        belief = self.belief[qid]
        best = max(real, key=lambda h: belief.get(h.id, 0.0))
        p = belief.get(best.id, 0.0)
        if p >= self.cfg.settle:
            q.status = "settled"
            best.status = "accepted"
            await self._emit(
                E.QUESTION_SETTLED, question_id=qid, hypothesis_id=best.id, posterior=p
            )
            return
        await self._check_robust(q)

    async def _reject(self, qid: str, hid: str, evidence_id: str | None, reason: str) -> None:
        h = self.state.hypotheses[hid]
        h.status = "rejected"
        if evidence_id:
            h.rejected_by.append(evidence_id)
        belief = self.belief[qid]
        belief.pop(hid, None)
        if sum(belief.values()) > 0.0:
            self.belief[qid] = _normalise(belief)
        self._sync_posteriors(qid)
        await self._emit(
            E.HYPOTHESIS_REJECTED,
            question_id=qid,
            hypothesis_id=hid,
            evidence_id=evidence_id,
            reason=reason,
        )
        self.state.rejected.append(
            {
                "hypothesis": hid,
                "question": qid,
                "evidence_id": evidence_id,
                "reason": reason,
            }
        )
        objection = self._register_evidence(
            Evidence(
                id=self._new_evidence_id(),
                kind="objection",
                claim=f"Rejected '{h.statement}' for '{self.state.questions[qid].text}': {reason}",
                author_role="referee",
                source_ref=evidence_id,
            )
        )
        await self._memory_write([objection])

    async def _reject_low(self, qid: str, evidence_id: str | None, context: str) -> None:
        for h in self._active_real(qid):
            p = self.belief[qid].get(h.id, 0.0)
            if p < self.cfg.reject_below:
                reason = f"posterior {p:.4f} fell below {self.cfg.reject_below} {context}"
                await self._reject(qid, h.id, evidence_id, reason)

    # ------------------------------------------------------------------ categorical loop

    async def _categorical_loop(self) -> None:
        while True:
            open_qs = [
                q
                for q in self.state.questions.values()
                if q.kind == "categorical" and q.status == "open"
            ]
            if not open_qs:
                return
            self.budget.check()
            q = max(open_qs, key=lambda q: q.impact * _entropy(self.belief[q.id].values()))
            await self._question_round(q)

    async def _question_round(self, q: Question) -> None:
        if self.n_runs[q.id] >= self.cfg.max_experiments_per_question:
            await self._unresolve(q, f"out of experiments ({self.n_runs[q.id]} run)")
            return
        self._where = f"design:{q.id}"
        recalled = await self._recall("designer", q.text)
        evidence = self._context_evidence(recalled)
        history = self.state.trials_for(q.id)
        proposals = await self.deps.agents.design(q, self._active_real(q.id), evidence, history)

        self._where = f"predict:{q.id}"
        candidates = await self._fill_likelihoods(q, self._prepare(q, list(proposals)))
        for exp in candidates:
            await self._publish_experiment(exp)
        if not candidates:
            await self._unresolve(q, "no new informative experiment was proposed")
            return

        ranked = self._rank(q, candidates)
        best_eig = max(e.eig_bits or 0.0 for e in ranked)
        if best_eig < self.cfg.min_eig_bits:
            await self._unresolve(
                q,
                f"best expected information gain {best_eig:.3f} bits "
                f"is below {self.cfg.min_eig_bits} bits",
            )
            return
        chosen = self._select(ranked, candidates)
        for e in ranked:
            stored = self.state.experiments[e.id]
            stored.eig_bits, stored.score = e.eig_bits, e.score
        await self._emit(
            E.EXPERIMENT_SCORED,
            question_id=q.id,
            ranking=[
                {
                    "experiment_id": e.id,
                    "kind": e.kind,
                    "goal": e.goal,
                    "eig_bits": e.eig_bits,
                    "est_cost_s": e.est_cost_s,
                    "est_cost_usd": e.est_cost_usd,
                    "score": e.score,
                }
                for e in ranked
            ],
            chosen=chosen.id,
        )
        await self._run_categorical(self.state.experiments[chosen.id])

    def _prepare(self, q: Question, proposals: list[Experiment]) -> list[Experiment]:
        """Normalise ids and hashes; drop spent, duplicate, bin-less and disallowed designs."""
        out: list[Experiment] = []
        seen: set[str] = set()
        mode = {
            "sampled": "sampled",
            "exact_only": "exact",
            "jev": "jev",
            "stated": "stated",
            "tinker": "tinker",
        }
        for raw in proposals:
            exp = raw.model_copy(deep=True)
            qids = [q.id, *exp.question_ids]
            exp.question_ids = [
                qid
                for qid in dict.fromkeys(qids)
                if qid in self.state.questions
                and self.state.questions[qid].kind == "categorical"
                and self.state.questions[qid].status == "open"
            ]
            if exp.kind == "search" and (
                not self.cfg.search or self.deps.search is None or not exp.query
            ):
                continue
            bin_ids = [b.id for b in exp.bins]
            if len(bin_ids) < 2 or len(set(bin_ids)) != len(bin_ids):
                continue  # bins that cannot separate two options
            h = spec_hash(exp)
            if h in self.spent or h in seen:
                continue
            seen.add(h)
            exp.spec_hash = h
            exp.id = self._experiment_id(exp.id, h)
            exp.status = "proposed"
            exp.eig_bits = exp.score = None
            exp.likelihood_source = mode[self.cfg.predictor]  # type: ignore[assignment]
            if self.cfg.predictor != "stated":
                exp.likelihood = {}
            out.append(exp)
        return out

    def _experiment_id(self, wanted: str, h: str) -> str:
        if h in self.exp_by_hash:
            return self.exp_by_hash[h]
        used = set(self.exp_by_hash.values()) | set(self.state.experiments)
        eid = (wanted or "").strip() or f"e{len(used) + 1}"
        base, n = eid, 1
        while eid in used:
            n += 1
            eid = f"{base}-{n}"
        self.exp_by_hash[h] = eid
        return eid

    def _options_for(self, exp: Experiment) -> list[Hypothesis]:
        seen: dict[str, Hypothesis] = {}
        for qid in exp.question_ids:
            for h in self._active_real(qid):
                seen.setdefault(h.id, h)
        return list(seen.values())

    async def _predict(self, exp: Experiment, hyps: list[Hypothesis], context: str) -> None:
        """Ask the predictor for the rows ``exp`` lacks and cache them by spec hash."""
        probe = exp.model_copy(deep=True)
        requested = probe.likelihood_source
        table = await self.deps.predictor.predict(probe, list(hyps), context)
        bins = [b.id for b in exp.bins]
        cache = self.lik_cache.setdefault(exp.spec_hash or "", {})
        declined = self.lik_declined.setdefault(exp.spec_hash or "", set())
        for h in hyps:
            row = _clean_row((table or {}).get(h.id), bins)
            if row is not None:
                cache[h.id] = row
            else:
                declined.add(h.id)
        source = probe.likelihood_source or requested
        previous = self.lik_source.get(exp.spec_hash or "")
        if previous is None or previous == "exact":
            self.lik_source[exp.spec_hash or ""] = source

    def _context(self, q: Question) -> str:
        return f"Goal: {self.state.brief.get('goal', '')}\nQuestion: {q.text}"

    async def _fill_likelihoods(
        self, q: Question, candidates: list[Experiment]
    ) -> list[Experiment]:
        stated = self.cfg.predictor == "stated"
        jobs = []
        for exp in candidates:
            if stated:
                bins = [b.id for b in exp.bins]
                cache = self.lik_cache.setdefault(exp.spec_hash or "", {})
                for hid, raw in exp.likelihood.items():
                    row = _clean_row(raw, bins)
                    if row is not None:
                        cache.setdefault(hid, row)
                self.lik_source[exp.spec_hash or ""] = "stated"
                continue
            cached = self.lik_cache.get(exp.spec_hash or "", {})
            declined = self.lik_declined.get(exp.spec_hash or "", set())
            missing = [
                h for h in self._options_for(exp) if h.id not in cached and h.id not in declined
            ]
            if missing:
                jobs.append(self._predict(exp, missing, self._context(q)))
        if jobs:
            await _gather(*jobs)

        kept = []
        for exp in candidates:
            if self._attach_rows(exp) and self._separates(exp, q):
                kept.append(exp)
        return kept

    def _attach_rows(self, exp: Experiment) -> bool:
        """Set ``exp.likelihood`` from the cache plus 1/B null rows. False if a row is missing."""
        cache = self.lik_cache.get(exp.spec_hash or "", {})
        bins = [b.id for b in exp.bins]
        table: dict[str, dict[str, float]] = dict(exp.likelihood) if exp.likelihood else {}
        for h in self._options_for(exp):
            if h.id not in cache:
                return False
            table[h.id] = cache[h.id]
        for hid, row in cache.items():
            table.setdefault(hid, row)
        for qid in exp.question_ids:
            null_id = self.null_of.get(qid)
            if null_id is not None:
                table[null_id] = {b: 1.0 / len(bins) for b in bins}
        exp.likelihood = table
        exp.likelihood_source = self.lik_source.get(exp.spec_hash or "", exp.likelihood_source)  # type: ignore[assignment]
        return True

    def _separates(self, exp: Experiment, q: Question) -> bool:
        """Relevance: do two of the question's real options predict different bins?

        Rejected options count too (where a prediction exists), so a check on which every
        proposal agreed stays irrelevant after rivals are rejected; it would otherwise look
        informative against the uniform null. With fewer than two predicted real options, the
        remaining one is compared with the null.
        """
        ids = [h.id for h in self.state.options(q.id, include_null=False) if h.id in exp.likelihood]
        if len(ids) < 2 and q.id in self.null_of:
            ids.append(self.null_of[q.id])
        rows = [exp.likelihood[i] for i in ids if i in exp.likelihood]
        return any(
            _tv(rows[i], rows[j]) >= RELEVANCE_TV
            for i in range(len(rows))
            for j in range(i + 1, len(rows))
        )

    async def _publish_experiment(self, exp: Experiment) -> None:
        """Store the experiment and emit ``experiment.proposed`` when it is new or grew rows."""
        rows = tuple(sorted(exp.likelihood))
        known = self.state.experiments.get(exp.id)
        if known is not None and known.status != "proposed":
            return
        self.state.experiments[exp.id] = exp
        if self.emitted_rows.get(exp.id) != rows:
            self.emitted_rows[exp.id] = rows
            await self._emit(E.EXPERIMENT_PROPOSED, experiment=exp)

    def _rank(self, q: Question, candidates: list[Experiment]) -> list[Experiment]:
        options = self.state.options(q.id, active_only=True)
        ranked = list(scoring.rank(q, options, candidates))
        for e in ranked:
            e.score = scoring.score(e.eig_bits or 0.0, e.est_cost_s, q.impact, self.cfg.cost_lambda)
        return sorted(ranked, key=lambda e: -(e.score or 0.0))

    def _select(self, ranked: list[Experiment], candidates: list[Experiment]) -> Experiment:
        by_id = {e.id: e for e in ranked}
        if self.cfg.selection == "random":
            return by_id[self.rng.choice(candidates).id]
        if self.cfg.selection == "model_pick":
            return by_id[candidates[0].id]
        return ranked[0]

    async def _run_categorical(self, exp: Experiment) -> None:
        self._where = f"run:{exp.id}"
        exp.status = "running"
        if exp.spec_hash:
            self.spent.add(exp.spec_hash)
        for qid in exp.question_ids:
            self.n_runs[qid] = self.n_runs.get(qid, 0) + 1
        await self._emit(
            E.EXPERIMENT_STARTED,
            experiment_id=exp.id,
            question_ids=list(exp.question_ids),
            kind=exp.kind,
        )
        if exp.kind == "search":
            obs = await self._run_search(exp)
        else:
            obs = (await self.lab.run(exp)).model_copy(update={"experiment_id": exp.id})
            await self._stream_logs(exp.id, obs.log_ref)
        bin_ids = [b.id for b in exp.bins]
        if obs.bin_id is None and obs.value is not None:
            obs.bin_id = bin_for(exp.bins, obs.value)
        primary = exp.question_ids[0] if exp.question_ids else None
        if obs.bin_id in bin_ids and primary in self.belief:
            pbar = self._pbar(primary, exp, obs.bin_id)
            obs.surprise = -math.log(pbar) if pbar > 0.0 else 0.0
        await self._emit(E.EXPERIMENT_FINISHED, observation=obs)
        self.budget.on_experiment(obs.seconds, obs.cost_usd)
        await self._tick()

        valid = obs.valid and obs.bin_id in bin_ids
        if valid:
            self._where = f"referee:{exp.id}"
            ok, note = await self.deps.agents.referee(exp, obs)
            valid = bool(ok)
        else:
            note = obs.referee_note or "the run produced no valid outcome bin"
        obs.valid, obs.referee_note = valid, str(note)
        await self._emit(
            E.REFEREE_VERDICT, experiment_id=exp.id, valid=valid, note=obs.referee_note
        )
        exp.status = "done" if valid else "invalid"
        self.state.trials.append(Trial(experiment=exp, observation=obs))

        if valid:
            assert obs.bin_id is not None
            label = next((b.description for b in exp.bins if b.id == obs.bin_id), "")
            ev = self._register_evidence(
                Evidence(
                    id=self._new_evidence_id(),
                    kind="observation",
                    claim=f"{exp.goal}: observed '{obs.bin_id}' ({label})",
                    author_role="referee",
                    source_ref=exp.id,
                    conditions={"code_hash": exp.spec_hash, "bin_id": obs.bin_id},
                )
            )
            self.obs_evidence[exp.id] = ev.id
            await self._memory_write([ev])
            for qid in list(exp.question_ids):
                if self.state.questions[qid].status != "open":
                    continue
                surprise = await self._apply(qid, exp, obs.bin_id, ev.id, allow_surprise=True)
                if surprise:
                    await self._regenerate(self.state.questions[qid])
        for qid in exp.question_ids:
            q = self.state.questions[qid]
            if q.status == "open" and self.n_runs[qid] >= self.cfg.max_experiments_per_question:
                await self._unresolve(q, f"out of experiments ({self.n_runs[qid]} run)")

    def _pbar(self, qid: str, exp: Experiment, bin_id: str) -> float:
        prior = self.belief[qid]
        return sum(p * exp.likelihood.get(h, {}).get(bin_id, 0.0) for h, p in prior.items())

    async def _apply(
        self,
        qid: str,
        exp: Experiment,
        bin_id: str,
        evidence_id: str | None,
        *,
        allow_surprise: bool,
        check: bool = True,
    ) -> bool:
        """Bayes-update one question on one observation. Returns True on a surprise."""
        prior = dict(self.belief[qid])
        lik = {h: exp.likelihood[h] for h in prior if h in exp.likelihood}
        if set(lik) != set(prior):
            return False  # a live option has no prediction for this experiment
        pbar = self._pbar(qid, exp, bin_id)
        posterior = dict(scoring.update(prior, lik, bin_id))
        await self._emit(
            E.BELIEF_UPDATED,
            question_id=qid,
            experiment_id=exp.id,
            observed=bin_id,
            prior=prior,
            posterior=posterior,
        )
        self.state.updates.append(
            BeliefUpdate(question_id=qid, experiment_id=exp.id, prior=prior, posterior=posterior)
        )
        nulls = {self.null_of[qid]} if qid in self.null_of else set()
        surprise = allow_surprise and bool(scoring.is_surprise(prior, lik, bin_id, null_ids=nulls))
        self.belief[qid] = posterior
        self._sync_posteriors(qid)
        await self._reject_low(qid, evidence_id, f"after {exp.id} observed '{bin_id}'")
        if surprise:
            null_id = self.null_of.get(qid)
            null_mass = posterior.get(null_id) if null_id else None
            reason = f"observed '{bin_id}' had predictive probability {pbar:.3f}"
            if null_mass is not None:
                reason += f"; 'none of these' now holds {null_mass:.2f}"
            await self._emit(
                E.SURPRISE_RAISED,
                question_id=qid,
                experiment_id=exp.id,
                reason=reason,
                z_score=None,
                null_mass=null_mass,
            )
        elif check:
            await self._check_closed(qid)
        return surprise

    async def _regenerate(self, q: Question) -> None:
        """After a surprise: new options consistent with every logged outcome, then replay."""
        if self.regens[q.id] >= self.cfg.max_regenerations:
            await self._check_closed(q.id)
            return
        self.regens[q.id] += 1
        self._where = f"regenerate:{q.id}"
        old = self._active_real(q.id)
        history = self.state.trials_for(q.id)
        proposals = await self.deps.agents.regenerate(q, list(old), history)

        known = {_norm_statement(h.statement) for h in self.state.options(q.id)}
        new: list[Hypothesis] = []
        for raw in proposals:
            norm = _norm_statement(raw.statement)
            if raw.is_null or not norm or norm in known:
                continue
            known.add(norm)
            h = raw.model_copy(
                deep=True,
                update={
                    "question_id": q.id,
                    "status": "active",
                    "rejected_by": [],
                    "is_null": False,
                },
            )
            h.id = self._unique_hyp_id(h.id, q.id)
            while any(h.id == n.id for n in new):
                h.id = self._unique_hyp_id(f"{h.id}-r", q.id)
            new.append(h)

        candidates = old + new
        jobs = []
        for t in history:
            exp = self.state.experiments[t.experiment.id]
            missing = [
                h for h in candidates if h.id not in self.lik_cache.get(exp.spec_hash or "", {})
            ]
            if missing:
                jobs.append(self._predict(exp, missing, self._context(q)))
        if jobs:
            await _gather(*jobs)
        grown = []
        for t in history:
            exp = self.state.experiments[t.experiment.id]
            cache = self.lik_cache.get(exp.spec_hash or "", {})
            before = set(exp.likelihood)
            for h in candidates:
                if h.id in cache:
                    exp.likelihood[h.id] = cache[h.id]
            if set(exp.likelihood) != before:
                grown.append(exp)

        def conflict(h: Hypothesis) -> Trial | None:
            for t in history:
                exp = self.state.experiments[t.experiment.id]
                row = exp.likelihood.get(h.id)
                b = len(exp.bins)
                if row is None or row.get(t.observation.bin_id or "", 0.0) < CONSISTENT_RATIO / b:
                    return t
            return None

        for h in old:
            t = conflict(h)
            if t is not None:
                reason = (
                    f"inconsistent with the logged outcome '{t.observation.bin_id}' "
                    f"of {t.experiment.id}"
                )
                await self._reject(q.id, h.id, self.obs_evidence.get(t.experiment.id), reason)
        kept_old = self._active_real(q.id)
        kept_new = [h for h in new if conflict(h) is None]
        if not kept_old and not kept_new:
            await self._unresolve(q, "no option is consistent with every logged outcome")
            return

        null_id = self.null_of.get(q.id)
        null_prior = self.cfg.null_prior if null_id else 0.0
        weights = {h.id: h.prior if h.prior > 0.0 else 1.0 for h in kept_old}
        fill = sum(weights.values()) / len(weights) if weights else 1.0
        weights.update({h.id: fill for h in kept_new})
        total = sum(weights.values())
        priors = {hid: (1.0 - null_prior) * w / total for hid, w in weights.items()}
        if null_id:
            priors[null_id] = null_prior
        for h in kept_new:
            h.prior = h.posterior = priors[h.id]
            self.state.hypotheses[h.id] = h
            await self._emit(E.HYPOTHESIS_PROPOSED, hypothesis=h)
        for hid, p in priors.items():
            self.state.hypotheses[hid].prior = p
        self.belief[q.id] = dict(priors)
        self._sync_posteriors(q.id)
        await self._emit(E.HYPOTHESIS_MERGED, question_id=q.id, kept="", merged=[], priors=priors)

        for exp in grown:
            await self._emit(E.EXPERIMENT_PROPOSED, experiment=exp)
            self.emitted_rows[exp.id] = tuple(sorted(exp.likelihood))
        for t in history:
            exp = self.state.experiments[t.experiment.id]
            assert t.observation.bin_id is not None
            await self._apply(
                q.id,
                exp,
                t.observation.bin_id,
                self.obs_evidence.get(exp.id),
                allow_surprise=False,
                check=False,
            )
        await self._check_closed(q.id)

    async def _run_search(self, exp: Experiment) -> Observation:
        search = self.deps.search
        assert search is not None and exp.query
        t0 = self.clock()
        try:
            results = list(await search.find(exp.query, k=5))
        except Exception as exc:  # a refused query or a provider outage, not a crashed run
            logger.exception("search experiment %s failed", exp.id)
            note = _SECRET.sub("[redacted]", f"search failed: {type(exc).__name__}: {exc}")
            await self._emit(
                E.SEARCH_DONE,
                experiment_id=exp.id,
                query=exp.query,
                urls=[],
                blocked=[],
                bin_id=None,
            )
            return Observation(
                experiment_id=exp.id,
                valid=False,
                seconds=round(max(self.clock() - t0, 0.0), 6),
                cost_usd=float(getattr(exc, "cost_reservation_usd", 0.0) or 0.0),
                referee_note=note[:500],
            )
        blocked = [str(u) for u in (getattr(search, "last_blocked", None) or [])]
        found = [self._register_evidence(e) for e in results]
        urls = [e.url for e in found if e.url]
        value = {
            "n_results": len(found),
            "text": " ".join(e.claim for e in found).lower(),
            "urls": urls,
        }
        bin_id = bin_for(exp.bins, value)
        await self._emit(
            E.SEARCH_DONE,
            experiment_id=exp.id,
            query=exp.query,
            urls=urls,
            blocked=blocked,
            bin_id=bin_id,
        )
        for e in found:
            line = f"{e.url or '-'}: {e.claim}"
            await self._emit(
                E.EXPERIMENT_LOG,
                experiment_id=exp.id,
                stream="stdout",
                line=line[:MAX_LOG_CHARS],
            )
        await self._memory_write(found)
        return Observation(
            experiment_id=exp.id,
            valid=bin_id is not None,
            # what the bins were computed on, so the referee can check the rules' inputs
            value=value,
            bin_id=bin_id,
            seconds=round(max(self.clock() - t0, 0.0), 6),
            cost_usd=exp.est_cost_usd,
            referee_note="" if bin_id is not None else "no bin rule matched the search results",
        )

    async def _stream_logs(self, experiment_id: str, log_ref: str) -> None:
        if not log_ref:
            return
        path = Path(log_ref)
        if not path.is_absolute():
            path = self.run_dir / path
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return
        for line in lines[:MAX_LOG_LINES]:
            stream = "stdout"
            if line.startswith("[stderr] "):
                stream, line = "stderr", line[len("[stderr] ") :]
            await self._emit(
                E.EXPERIMENT_LOG,
                experiment_id=experiment_id,
                stream=stream,
                line=line[:MAX_LOG_CHARS],
            )
        if len(lines) > MAX_LOG_LINES:
            more = f"... {len(lines) - MAX_LOG_LINES} more lines in {log_ref}"
            await self._emit(
                E.EXPERIMENT_LOG,
                experiment_id=experiment_id,
                stream="stdout",
                line=more,
            )

    # ------------------------------------------------------------------ numeric labs

    def _families_for(self, q: Question) -> list[ModelFamily]:
        provider = getattr(self.lab, "model_families", None)
        lab_families = list(provider()) if callable(provider) else []
        by_name = {f.name: f for f in lab_families}
        out: list[ModelFamily] = []
        for h in self._active_real(q.id):
            fam = by_name.get(h.id) or (by_name.get(h.answer_key) if h.answer_key else None)
            if fam is None and h.model_code:
                from core.model_sandbox import ModelSourceError, SandboxedFamily

                try:
                    fam = SandboxedFamily.from_source(h.id, h.model_code)
                except ModelSourceError as exc:
                    self._pending_rejects.append((h.id, f"model code rejected: {exc}"))
                    continue
            if fam is None:
                self._pending_rejects.append((h.id, "no executable model for this option"))
                continue
            out.append(dataclasses.replace(fam, name=h.id, prior_weight=max(h.prior, 1e-12)))
        return out

    @staticmethod
    def _design_value(design: dict) -> float | tuple[float, ...]:
        vals = [float(v) for v in design.values()]
        return vals[0] if len(vals) == 1 else tuple(vals)

    @staticmethod
    def _design_label(design: dict) -> str:
        return ",".join(f"{k}={float(v):g}" for k, v in design.items())

    async def _numeric_question(self, q: Question, designs: list[dict] | None) -> None:
        self._where = f"numeric:{q.id}"
        if not designs:
            await self._unresolve(q, "the lab offers no design grid")
            return
        self._pending_rejects = []
        families = self._families_for(q)
        for hid, reason in self._pending_rejects:
            await self._reject(q.id, hid, None, reason)
        if not families:
            await self._unresolve(q, "no executable model families")
            return

        null_id = self.null_of.get(q.id)
        null_weight = self.state.hypotheses[null_id].prior if null_id else 0.0
        sigma = float(getattr(self.lab, "sigma", 1.0))
        max_m = int(
            getattr(self.lab, "max_measurements", 0)
            or self.state.brief.get("budget", {}).get("measurements", DEFAULT_MEASUREMENTS)
        )
        cost_s = float(getattr(self.lab, "measure_cost_s", 1.0))
        belief = await asyncio.to_thread(
            ParticleBelief, families, sigma, seed=self.cfg.seed, null_weight=null_weight
        )
        names = {f.name: f.name for f in families}
        if null_id:
            names[NULL_NAME] = null_id
        values = [self._design_value(d) for d in designs]
        labels = [self._design_label(d) for d in designs]
        index = {v: i for i, v in enumerate(values)}
        one_d = all(isinstance(v, float) for v in values)
        points: list[dict[str, float]] = []

        def mapped(post: dict[str, float]) -> dict[str, float]:
            return {names[k]: float(v) for k, v in post.items() if k in names}

        for i in range(max_m):
            self.budget.check()
            ranking = await asyncio.to_thread(belief.rank_designs, values, "family")
            scored = []
            for design, eig, _ in ranking:
                j = index[design]
                s = scoring.score(eig, cost_s, q.impact, self.cfg.cost_lambda)
                scored.append((j, float(eig), float(s)))
            scored.sort(key=lambda t: -t[2])
            pick = await self._numeric_pick(q, scored, designs)
            j, eig, s = next(t for t in scored if t[0] == pick)
            await self._emit(
                E.EXPERIMENT_SCORED,
                question_id=q.id,
                ranking=[
                    {
                        "experiment_id": labels[k],
                        "kind": "measure",
                        "goal": f"measure at {labels[k]}",
                        "eig_bits": e,
                        "est_cost_s": cost_s,
                        "est_cost_usd": 0.0,
                        "score": sc,
                    }
                    for k, e, sc in scored
                ],
                chosen=labels[j],
            )
            exp = Experiment(
                id=f"m{i + 1}:{labels[j]}",
                question_ids=[q.id],
                kind="measure",
                goal=f"measure at {labels[j]}",
                design=dict(designs[j]),
                est_cost_s=cost_s,
                eig_bits=eig,
                score=s,
                status="running",
            )
            exp.spec_hash = spec_hash(exp)
            self.state.experiments[exp.id] = exp
            await self._emit(
                E.EXPERIMENT_PROPOSED,
                experiment=exp,
                replay_prior=mapped(belief.family_posterior()) if i == 0 else None,
            )
            self._where = f"run:{exp.id}"
            await self._emit(
                E.EXPERIMENT_STARTED,
                experiment_id=exp.id,
                question_ids=[q.id],
                kind="measure",
            )
            obs = (await self.lab.run(exp)).model_copy(update={"experiment_id": exp.id})
            await self._stream_logs(exp.id, obs.log_ref)
            await self._emit(E.EXPERIMENT_FINISHED, observation=obs)
            self.budget.on_experiment(obs.seconds, obs.cost_usd)
            await self._tick()
            y = obs.value
            valid = obs.valid and isinstance(y, (int, float)) and math.isfinite(float(y))
            exp.status = "done" if valid else "invalid"
            self.state.trials.append(Trial(experiment=exp, observation=obs))
            if not valid:
                note = obs.referee_note or "the measurement is not a finite number"
                await self._emit(E.REFEREE_VERDICT, experiment_id=exp.id, valid=False, note=note)
                continue
            assert isinstance(y, (int, float))
            prior = mapped(belief.family_posterior())
            result = await asyncio.to_thread(belief.update, values[j], float(y))
            posterior = mapped(result.family_posterior)
            await self._emit(
                E.BELIEF_UPDATED,
                question_id=q.id,
                experiment_id=exp.id,
                observed=float(y),
                prior=prior,
                posterior=posterior,
                log_likelihood={
                    names[k]: v for k, v in result.log_likelihood.items() if k in names
                },
            )
            self.state.updates.append(
                BeliefUpdate(
                    question_id=q.id,
                    experiment_id=exp.id,
                    prior=prior,
                    posterior=posterior,
                )
            )
            self.belief[q.id] = posterior
            self._sync_posteriors(q.id)
            x = values[j] if isinstance(values[j], float) else float(values[j][0])
            points.append({"x": x, "y": float(y)})
            if one_d:
                curves = await asyncio.to_thread(self._curves, belief, families, values, names)
                await self._emit(
                    E.MODEL_CURVES,
                    question_id=q.id,
                    x=[float(v) for v in values],
                    families=curves,
                    points=list(points),
                )
            self.state.numeric = {
                "question_id": q.id,
                "points": list(points),
                "family_posterior": posterior,
            }
            ev = self._register_evidence(
                Evidence(
                    id=self._new_evidence_id(),
                    kind="observation",
                    claim=f"y = {float(y):.4g} at {labels[j]}",
                    author_role="lab",
                    source_ref=exp.id,
                    conditions={"design": dict(designs[j])},
                )
            )
            self.obs_evidence[exp.id] = ev.id
            await self._memory_write([ev])
            if result.surprise:
                null_mass = posterior.get(null_id) if null_id else None
                await self._emit(
                    E.SURPRISE_RAISED,
                    question_id=q.id,
                    experiment_id=exp.id,
                    reason=(
                        f"y = {float(y):.4g} is {result.z_score:+.1f} predictive sd from the "
                        "mixture mean, or 'none of these' gained mass"
                    ),
                    z_score=float(result.z_score),
                    null_mass=null_mass,
                )
            for h in self._active_real(q.id):
                p = posterior.get(h.id, 0.0)
                if p < self.cfg.reject_below:
                    reason = f"posterior {p:.4f} fell below {self.cfg.reject_below} after {exp.id}"
                    await self._reject_numeric(q.id, h.id, ev.id, reason)
            real = self._active_real(q.id)
            best = max(real, key=lambda h: posterior.get(h.id, 0.0), default=None)
            if best is not None and posterior.get(best.id, 0.0) >= self.cfg.settle:
                q.status = "settled"
                best.status = "accepted"
                await self._emit(
                    E.QUESTION_SETTLED,
                    question_id=q.id,
                    hypothesis_id=best.id,
                    posterior=posterior[best.id],
                )
                return
        await self._unresolve(q, f"measurement budget of {max_m} spent")

    async def _reject_numeric(self, qid: str, hid: str, evidence_id: str, reason: str) -> None:
        """Mark a model family rejected; its particles stay in the belief (soft rejection)."""
        h = self.state.hypotheses[hid]
        h.status = "rejected"
        h.rejected_by.append(evidence_id)
        await self._emit(
            E.HYPOTHESIS_REJECTED,
            question_id=qid,
            hypothesis_id=hid,
            evidence_id=evidence_id,
            reason=reason,
        )
        self.state.rejected.append(
            {
                "hypothesis": hid,
                "question": qid,
                "evidence_id": evidence_id,
                "reason": reason,
            }
        )

    async def _numeric_pick(
        self, q: Question, scored: list[tuple[int, float, float]], designs: list[dict]
    ) -> int:
        if self.cfg.selection == "random":
            return self.rng.randrange(len(designs))
        if self.cfg.selection == "model_pick":
            self._where = f"design:{q.id}"
            history = self.state.trials_for(q.id)
            evidence = list(self.state.evidence.values())
            proposals = await self.deps.agents.design(q, self._active_real(q.id), evidence, history)
            for exp in proposals:
                if exp.design is not None and exp.design in designs:
                    return designs.index(exp.design)
        return scored[0][0]

    @staticmethod
    def _curves(
        belief: ParticleBelief,
        families: list[ModelFamily],
        values: list[Any],
        names: dict[str, str],
    ) -> dict[str, dict[str, Any]]:
        designs = as_designs(values)
        post = belief.family_posterior()
        predictors = {f.name: f.predict for f in families}
        out: dict[str, dict[str, Any]] = {}
        for name in belief.family_names:
            params, w = belief.particles(name)
            if name in predictors:
                preds = np.asarray(predictors[name](designs, params), dtype=float)
            else:  # the built-in null family: y = c
                preds = np.broadcast_to(params[:, :1], (params.shape[0], designs.shape[0]))
            preds = np.where(np.isfinite(preds), preds, 0.0)
            mean = w @ preds
            sd = np.sqrt(np.maximum(w @ (preds - mean) ** 2, 0.0))
            out[names.get(name, name)] = {
                "mean": [round(float(v), 6) for v in mean],
                "sd": [round(float(v), 6) for v in sd],
                "weight": float(post[name]),
            }
        return out

    # ------------------------------------------------------------------ delivery and report

    async def _deliver_and_critique(self) -> None:
        rounds = self.cfg.max_critic_rounds if self.cfg.critic else 1
        contract = dict(self.state.brief.get("contract", {}) or {})
        for round_no in range(1, rounds + 1):
            self.budget.check()
            self._where = "deliver"
            self.state.delivery_round = round_no
            artifacts = list(await self.lab.deliver(self.state))
            self.state.artifacts = artifacts
            for a in artifacts:
                await self._emit(E.ARTIFACT_WRITTEN, artifact=a)
            if not self.cfg.critic:
                return
            self._where = "critic"
            recalled = await self._recall("critic", f"deliverable contract: {self.state.lab}")
            given = dict(contract)
            if recalled:
                given["recalled_evidence"] = [e.model_dump(mode="json") for e in recalled]
            findings = [
                self._register_finding(f)
                for f in await self.deps.agents.critic(list(artifacts), given)
            ]
            for f in findings:
                self.state.findings.append(f)
                await self._emit(E.CRITIC_FINDING, finding=f)
            await self._memory_write(self._critic_records(findings, round_no))
            for a in artifacts:
                mine = [f for f in findings if f.artifact == a.name]
                a.findings = [f.message for f in mine]
                a.contract_ok = not any(f.severity == "block" for f in mine)
                # Re-emit the same version (same sha256) with the critic's verdict, so the
                # event file records which artifacts passed their contract in this round.
                await self._emit(E.ARTIFACT_WRITTEN, artifact=a)
            blocking = [f for f in findings if f.severity == "block"]
            if not blocking or round_no == rounds:
                return
            reopened = False
            for f in blocking:
                q = self.state.questions.get(f.reopens_question or "")
                if q is not None and q.kind == "categorical" and q.status != "open":
                    q.status = "open"
                    for h in self.state.options(q.id):
                        if h.status == "accepted":
                            h.status = "active"
                    self.n_runs[q.id] = 0
                    await self._emit(E.QUESTION_OPENED, question=q)
                    reopened = True
            if reopened:
                await self._categorical_loop()

    def _critic_records(self, findings: list[CriticFinding], round_no: int) -> list[Evidence]:
        """The critic's findings as its own memory records (only when memory is on).

        A ``block`` is an objection, which memory keeps in every later recall; a ``warn`` is
        an ordinary observation. Like every record they inform prompts, never beliefs.
        """
        if not self._memory_on():
            return []
        return [
            self._register_evidence(
                Evidence(
                    id=self._new_evidence_id(),
                    kind="objection" if f.severity == "block" else "observation",
                    claim=f"Critic {f.severity} on {f.artifact} ({f.rule}): {f.message}"[:2000],
                    author_role="critic",
                    source_ref=f.id,
                    conditions={"severity": f.severity, "delivery_round": round_no},
                )
            )
            for f in findings
        ]

    def _register_finding(self, f: CriticFinding) -> CriticFinding:
        f = f.model_copy(deep=True)
        fid = f.id or f"f{len(self._finding_ids) + 1}"
        base, n = fid, 1
        while fid in self._finding_ids:
            n += 1
            fid = f"{base}-{n}"
        f.id = fid
        self._finding_ids.add(fid)
        return f

    async def _write_lessons(self) -> None:
        if not self.cfg.lessons:
            return
        lessons = []
        for q in self.state.questions.values():
            if q.status == "settled":
                best = self.state.best(q.id)
                if best is None:
                    continue
                runs = [t.experiment.id for t in self.state.trials_for(q.id)]
                claim = (
                    f"For '{q.text}', '{best.statement}' held "
                    f"(posterior {best.posterior:.2f}) after {', '.join(runs) or 'no experiments'}."
                )
            elif q.status == "robust":
                key = next((h.answer_key for h in self._active_real(q.id)), None)
                claim = f"For '{q.text}', every remaining option leads to the same result ({key})."
            else:
                continue
            ev = self._register_evidence(
                Evidence(
                    id=self._new_evidence_id(),
                    kind="lesson",
                    claim=claim,
                    author_role="reporter",
                    source_ref=q.id,
                )
            )
            await self._emit(E.LESSON_WRITTEN, lesson=ev)
            lessons.append(ev)
        await self._memory_write(lessons)

    def _unresolved_ids(self) -> list[str]:
        return [q.id for q in self.state.questions.values() if q.status in ("open", "unresolved")]

    def _enforce_report(self, report: Report) -> Report:
        return report.model_copy(
            update={
                "run_id": self.run_id,
                "artifacts": list(self.state.artifacts),
                "rejected": list(self.state.rejected),
                "unresolved": self._unresolved_ids(),
                "cost_usd": round(self.budget.cost_usd, 10),
                "seconds": round(self.budget.seconds, 6),
            }
        )

    def _fallback(self, status: str) -> Report:
        """A report built from what exists, without calling any agent."""
        lines = [f"# Methods ({status.replace('_', ' ')})", ""]
        if self._stop_reason:
            lines += [f"The run stopped early: {self._stop_reason}.", ""]
        for q in self.state.questions.values():
            best = self.state.best(q.id)
            answer = f"'{best.statement}' ({best.posterior:.2f})" if best else "no option"
            lines.append(f"- {q.text} [{q.status}]: {answer}")
        return Report(
            run_id=self.run_id,
            artifacts=list(self.state.artifacts),
            methods_md="\n".join(lines),
            rejected=list(self.state.rejected),
            unresolved=self._unresolved_ids(),
            cost_usd=round(self.budget.cost_usd, 10),
            seconds=round(self.budget.seconds, 6),
        )
