"""The claims lab: audit four curated claims from the DESeq2 paper with the Crux engine.

MVP on a hand-curated set of four claims (``labs.claims.library``). ``ClaimsLab``
implements ``core.interfaces.Lab`` plus the ``opening_events``/``bind`` hooks:

* ``brief``: the paper and the task "audit these claims" (no answers, no planted flag);
* ``opening_events``: one ``claims.source`` event right after ``run.started``;
* ``profile``: the paper's metadata and our paraphrase of its Methods, as evidence;
* ``run``: writes the experiment's pre-registered code to ``<run_dir>/work``, runs it with
  this interpreter in a subprocess with a timeout, keeps the output in
  ``<run_dir>/logs/<id>.log`` (streamed as ``experiment.log``), parses the single
  ``RESULT:`` line and picks the one bin whose rule holds (code, never a model);
* ``deliver``: writes ``<run_dir>/artifacts/CLAIMS.md``.

Like ``execution.local.LocalExecutor`` this is NOT a sandbox (no network block); it only
ever runs the library's own scripts. ``build_claims_run(cfg)`` wires the lab with
``ClaimsAgents`` and the library-row predictor; no model or API key is needed.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from core.events import CLAIMS_SOURCE
from core.schemas import (
    Artifact,
    EngineState,
    Evidence,
    Experiment,
    Observation,
    eval_rule,
)
from labs.claims.library import CLAIMS, DIAGNOSTICS
from labs.claims.report import claims_markdown
from labs.claims.source import EXCERPT, paper, source_payload

DEFAULT_TIMEOUT_S = 120
MAX_RESULT_CHARS = 256_000


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ClaimsLab:
    name = "claims"

    def __init__(self, *, timeout_s: int = DEFAULT_TIMEOUT_S, python: str | None = None) -> None:
        self.timeout_s = timeout_s
        self.python = python or sys.executable
        self.run_id = ""
        self.run_dir: Path | None = None
        self.executor: Any = None
        self._tmp: tempfile.TemporaryDirectory | None = None

    # --- Lab -------------------------------------------------------------------------

    def brief(self) -> dict:
        return {
            "goal": (
                "Audit four mathematical and statistical claims from the DESeq2 paper "
                "(Love, Huber & Anders 2014) with pre-registered symbolic and simulation "
                "diagnostics (MVP: a hand-curated set of four claims)"
            ),
            "task": "audit these claims",
            "paper": paper(),
            "claims": [{"question_id": c.id, "claim": c.claim, "kind": c.kind} for c in CLAIMS],
            "deliverable": "CLAIMS.md",
            "contract": {"CLAIMS.md": {"question_ids": [c.id for c in CLAIMS]}},
        }

    def opening_events(self) -> list[tuple[str, dict]]:
        return [(CLAIMS_SOURCE, source_payload())]

    async def profile(self) -> list[Evidence]:
        meta = paper()
        return [
            Evidence(
                id="paper",
                kind="profile",
                claim=f"Source paper: {meta['title']}. {meta['citation']}. License {meta['license']}.",
                author_role="lab",
                source_ref="labs/claims/source.py",
                url=meta["url"],
            ),
            Evidence(
                id="methods",
                kind="profile",
                claim=EXCERPT,
                author_role="lab",
                source_ref="labs/claims/source.py",
                url=meta["url"],
            ),
            Evidence(
                id="scope",
                kind="profile",
                claim=(
                    f"{len(CLAIMS)} hand-curated claims, each a question with curated options; "
                    f"{len(DIAGNOSTICS)} pre-registered diagnostics (symbolic algebra with "
                    "SymPy, simulations with numpy), run locally."
                ),
                author_role="lab",
                source_ref="labs/claims/library.py",
            ),
        ]

    def candidate_designs(self) -> list[dict] | None:
        return None

    async def run(self, exp: Experiment) -> Observation:
        name = (exp.design or {}).get("diagnostic")
        if name not in DIAGNOSTICS or exp.language != "python" or not exp.code:
            return Observation(
                experiment_id=exp.id, valid=False, referee_note="not a claims-library diagnostic"
            )
        root = self._root().resolve()  # absolute: the script runs with cwd=work
        work, logs = root / "work", root / "logs"
        work.mkdir(parents=True, exist_ok=True)
        logs.mkdir(parents=True, exist_ok=True)
        script = work / f"{exp.id}.py"
        script.write_text(exp.code, encoding="utf-8")
        env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
        error: str | None = None
        returncode: int | None = None
        started = time.monotonic()
        try:
            # A worker thread works under any event loop (Windows selector loops cannot
            # spawn subprocesses through asyncio).
            done = await asyncio.to_thread(
                subprocess.run,
                [self.python, "-u", str(script)],
                cwd=work,
                env=env,
                capture_output=True,
                timeout=self.timeout_s,
                check=False,
            )
            stdout, stderr, returncode = done.stdout, done.stderr, done.returncode
        except subprocess.TimeoutExpired as exc:
            stdout, stderr = exc.stdout or b"", exc.stderr or b""
            error = f"timed out after {self.timeout_s} s"
        except OSError as exc:
            stdout = stderr = b""
            error = f"could not start Python: {type(exc).__name__}"
        seconds = time.monotonic() - started
        out = stdout.decode("utf-8", "replace").splitlines()
        err = stderr.decode("utf-8", "replace").splitlines()
        log_rel = f"logs/{exp.id}.log"
        (root / log_rel).write_text(
            "\n".join([f"$ python {script.name}", *out, *(f"[stderr] {ln}" for ln in err)]) + "\n",
            encoding="utf-8",
        )
        if error is None and returncode != 0:
            error = f"the script exited with status {returncode}"
        value = None
        results = [ln for ln in out if ln.startswith("RESULT:")]
        if error is None:
            if len(results) == 1 and len(results[0]) <= MAX_RESULT_CHARS:
                try:
                    parsed = json.loads(results[0].removeprefix("RESULT:"))
                except ValueError:
                    parsed = None
                value = parsed if isinstance(parsed, dict) else None
            if value is None:
                error = f"expected one RESULT: line with a JSON object, got {len(results)}"
        bin_id = None
        if error is None:
            matched = [b.id for b in exp.bins if eval_rule(b.rule, value)]
            if len(matched) == 1:
                bin_id = matched[0]
            else:
                error = f"{len(matched)} bin rules hold for the result; expected exactly one"
        return Observation(
            experiment_id=exp.id,
            valid=error is None,
            value=value if error is None else None,
            bin_id=bin_id,
            referee_note=error or "",
            log_ref=log_rel,
            seconds=round(seconds, 3),
            cost_usd=0.0,
        )

    async def deliver(self, state: EngineState) -> list[Artifact]:
        out = Path(state.run_dir) / "artifacts" / "CLAIMS.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(claims_markdown(state), encoding="utf-8", newline="\n")
        return [Artifact(name=out.name, path=out.as_posix(), sha256=_sha256(out))]

    # --- LabHooks --------------------------------------------------------------------

    def bind(self, run_id: str, run_dir: Path, executor: Any = None) -> None:
        self.run_id, self.run_dir, self.executor = run_id, Path(run_dir), executor

    async def close(self) -> None:
        if self._tmp is not None:
            self._tmp.cleanup()
            self._tmp = None

    def _root(self) -> Path:
        if self.run_dir is not None:
            return self.run_dir
        if self._tmp is None:  # run() called outside the orchestrator (tests)
            self._tmp = tempfile.TemporaryDirectory(prefix="claims-")
        return Path(self._tmp.name)


def build_claims_run(cfg: Any, *, clock: Callable[[], float] = time.time) -> tuple[ClaimsLab, Any]:
    """The claims lab and its ``core.orchestrator.Deps``: no model, memory or search.

    The predictor is ``agents.predictor.SampledPredictor`` with no model: every curated
    option has a stated library row in every diagnostic of its question (the tests check
    this), so it never needs one.
    """
    from agents.predictor import SampledPredictor
    from core.orchestrator import Deps
    from labs.claims.agents import ClaimsAgents

    lab = ClaimsLab()
    deps = Deps(
        agents=ClaimsAgents(lab),
        predictor=SampledPredictor(None, n=cfg.n_predictor_samples, eps=cfg.eps),
        clock=clock,
    )
    return lab, deps
