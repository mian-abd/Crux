"""Task 9 lab as the orchestrator runs it: sandbox lifecycle, logs and delivery retries.

Wraps ``Task9Lab`` (DU-13) without changing it:

* ``bind``/``close`` (``core.interfaces.LabHooks``) own the sandbox. It opens lazily on
  the first async call, since ``brief()`` runs before ``bind``.
* ``ModalExecutor`` logs commands to ``execution.jsonl``; ``Observation.log_ref`` comes back
  as ``execution.jsonl#<command>``. That command's lines are copied to
  ``logs/<command>.txt`` so the orchestrator can stream them as ``experiment.log``.
* ``deliver`` asks the delivery planner for code, runs it, and retries invalid plans
  or failed executions up to ``max_attempts`` times per delivery round. Generated code
  is kept under ``delivery/`` in the run folder.
* ``memory``, when set, is the run's memory; ``close`` closes it after the sandbox.
* ``lessons``, when set, is the run's reviewed lesson corpus (see ``build_task9_run``):
  ``deliver`` gives the planner the designer's lessons and ``close`` closes their ledger.
"""

from __future__ import annotations

import json
import os
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

from labs.bixbench3.task9 import Task9Lab, validate_de_table
from labs.bixbench3.task9_contract import load_contract, load_prompt

if TYPE_CHECKING:
    from core.schemas import Artifact, EngineState, Evidence, Experiment, Observation

Planner = Callable[..., Awaitable[list[tuple[str, str]]]]
TASK_ID = "bixbench3-task9"
TASK9_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-5.5": (5.00, 30.00),
}


async def _no_planner(state: object) -> list[tuple[str, str]]:  # pragma: no cover
    raise RuntimeError("SwarmTask9Lab.deliver plans delivery itself")


class SwarmTask9Lab:
    name = "bixbench3"

    def __init__(
        self,
        executor: Any,
        *,
        llm: Any,
        planner: Planner | None = None,
        contract: dict | None = None,
        task_prompt: str | None = None,
        search: Any = None,
        summarize_search: Any = None,
        max_attempts: int = 3,
        delivery_timeout_s: int = 600,
        owns_search: bool = False,
    ) -> None:
        if planner is None:
            from agents.deliverer import plan_delivery

            planner = plan_delivery
        self.executor = executor
        self.llm = llm
        self.planner = planner
        self.contract = contract if contract is not None else load_contract()
        self.max_attempts = max_attempts
        self.delivery_timeout_s = delivery_timeout_s
        self.de_tables = frozenset(
            item["path"] for item in self.contract.values() if item.get("kind") == "de"
        )
        self.inner = Task9Lab(
            executor,
            "",
            task_prompt=task_prompt if task_prompt is not None else load_prompt()[0],
            contract=self.contract,
            plan_delivery=_no_planner,
            search=search,
            summarize_search=summarize_search,
            de_tables=self.de_tables,
        )
        self.run_id: str | None = None
        self.run_dir: Path | None = None
        self.sandbox_id: str | None = None
        self.profile_facts: list[dict] = []
        # ``build_task9_run`` hands over the search it built; ``close`` releases it.
        self.owns_search = owns_search
        # Likewise the run's memory, when build_task9_run built it.
        self.memory: Any = None
        # The run's reviewed lessons (``memory.lessons.RunLessons``) when it has a corpus:
        # the delivery planner reads the designer's, and ``close`` closes their ledger.
        self.lessons: Any = None

    # --- Lab -------------------------------------------------------------------------

    def brief(self) -> dict:
        return self.inner.brief()

    def candidate_designs(self) -> None:
        return None

    async def profile(self) -> list[Evidence]:
        await self._open()
        evidence = await self.inner.profile()
        for ev in evidence:
            try:
                self.profile_facts.append(json.loads(ev.claim))
            except ValueError:
                pass
        return evidence

    async def run(self, exp: Experiment) -> Observation:
        await self._open()
        obs = await self.inner.run(exp)
        obs.log_ref = self._text_log(obs.log_ref)
        return obs

    async def deliver(self, state: EngineState) -> list[Artifact]:
        from agents.llm import LLMOutputError
        from core.schemas import Artifact

        await self._open()
        # Only a run with a lesson corpus passes lessons, so other runs plan exactly as before.
        extra = {}
        if self.lessons is not None:
            extra["lessons"] = self.lessons.for_role("designer")
        error: str | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                steps = await self.planner(
                    self.llm, state, last_error=error, profile=self.profile_facts, **extra
                )
            except LLMOutputError:
                if attempt == self.max_attempts:
                    raise
                error = (
                    "The previous plan was incomplete or invalid. Return concise code, "
                    "reuse existing scratch files, and return a complete plan."
                )
                continue
            error = None
            for i, (language, code) in enumerate(steps, start=1):
                self._keep_code(state.delivery_round, attempt, i, language, code)
                result = await self.executor.run_code(
                    self.sandbox_id,
                    language,
                    code,
                    require_result=False,
                    timeout_s=self.delivery_timeout_s,
                )
                if not result["valid"]:
                    error = f"step {i} ({language}): {result['error']}\n{result.get('stderr', '')}"
                    break
            if error is None:
                break
        artifacts = []
        for export in await self.executor.collect_outputs(self.sandbox_id):
            name = export["name"]
            findings = (
                validate_de_table(Path(export["path"]))
                if name in self.de_tables
                else []
            )
            artifacts.append(
                Artifact(**export, contract_ok=not findings, findings=findings)
            )
        return artifacts

    # --- LabHooks --------------------------------------------------------------------

    def bind(self, run_id: str, run_dir: Path, executor: Any = None) -> None:
        self.run_id, self.run_dir = run_id, Path(run_dir)
        if self.executor is None and executor is not None:
            self.executor = self.inner.executor = executor

    async def close(self) -> None:
        try:
            if self.sandbox_id is not None and self.executor is not None:
                sandbox, self.sandbox_id = self.sandbox_id, None
                await self.executor.close(sandbox)
        finally:
            try:
                search = self.inner.search
                if self.owns_search and search is not None and hasattr(search, "aclose"):
                    self.owns_search = False
                    await search.aclose()
            finally:
                try:
                    memory, self.memory = self.memory, None
                    if memory is not None and hasattr(memory, "aclose"):
                        await memory.aclose()
                finally:
                    if self.lessons is not None:
                        await self.lessons.aclose()

    # --- helpers ---------------------------------------------------------------------

    async def _open(self) -> None:
        if self.sandbox_id is None:
            if self.run_id is None:
                raise RuntimeError("bind() must run before the lab is used")
            self.sandbox_id = await self.executor.open("bixbench3", self.run_id)
            self.inner.sandbox_id = self.sandbox_id

    def _text_log(self, log_ref: str) -> str:
        """``execution.jsonl#<command>`` -> ``logs/<command>.txt`` with that command's lines."""
        if "#" not in (log_ref or "") or self.run_dir is None:
            return log_ref
        name, command = log_ref.split("#", 1)
        source = self.run_dir / name
        if not source.is_file():
            return log_ref
        lines = []
        for raw in source.read_text(encoding="utf-8").splitlines():
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            if (
                event.get("type") == "experiment.log"
                and event.get("command_id") == command
            ):
                prefix = "[stderr] " if event.get("stream") == "stderr" else ""
                lines.append(prefix + str(event.get("line", "")))
        target = self.run_dir / "logs" / f"{command}.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return f"logs/{command}.txt"

    def _keep_code(
        self, round_: int, attempt: int, step: int, language: str, code: str
    ) -> None:
        if self.run_dir is None:
            return
        folder = self.run_dir / "delivery"
        folder.mkdir(parents=True, exist_ok=True)
        suffix = {"r": "R", "python": "py"}.get(language, "txt")
        (folder / f"round{round_}-attempt{attempt}-step{step}.{suffix}").write_text(
            code, encoding="utf-8"
        )


def build_task9_lab(
    *,
    llm: Any,
    runs_dir: Path,
    case_dir: Path | None = None,
    manifest: Path | None = None,
    search: Any = None,
    owns_search: bool = False,
) -> SwarmTask9Lab:
    """A Task 9 lab on Modal (``manifest`` from ``execution.staging``) or, for development,
    on this machine (``case_dir`` holding the counts and sample sheet)."""
    if (case_dir is None) == (manifest is None):
        raise ValueError("Pass exactly one of case_dir (local) or manifest (Modal)")
    if manifest is not None:
        from execution.sandbox import ModalExecutor
        from execution.staging import Task9Inputs

        executor: Any = ModalExecutor(Task9Inputs.load(Path(manifest)), Path(runs_dir))
    else:
        from execution.local import LocalExecutor

        executor = LocalExecutor(Path(case_dir), Path(runs_dir))
    return SwarmTask9Lab(executor, llm=llm, search=search, owns_search=owns_search)


def build_task9_run(
    cfg: Any,
    *,
    case_dir: Path | None = None,
    manifest: Path | None = None,
    llm: Any = None,
    search: Any = None,
    memory: Any = None,
) -> tuple[SwarmTask9Lab, Any]:
    """The lab and ``Deps`` for one real Task 9 run with the swarm's agents.

    ``cfg.predictor == "tinker"`` swaps the sampled predictor for ``TinkerPredictor`` on the
    sampler path in env ``CRUX_TINKER_PREDICTOR``, reading the lab's parsed profile; the
    sampled predictor stays as its fallback. Library rows win as in the sampled predictor;
    ``CRUX_TINKER_OVERRIDE_STATED=1`` lets the model replace the stated rows too.

    Search: with ``cfg.search`` on and ``EXA_API_KEY`` set, and no ``search`` passed, the
    run gets the guarded Exa search (``search.task9.build_task9_search``) as ``Deps.search``
    and in the lab, which closes it at the end of the run. With ``cfg.search`` off neither
    gets a search, even one passed in.

    Memory: ``memory`` if given (the caller closes it), else one built from ``cfg.memory``
    by ``memory.run.memory_from_config``: past.dev when ``PAST_API_KEY`` is set, the
    role-only local ledger for ``local_role_only``, otherwise none. A built memory is scoped
    to the run id on first use and closed with the lab. The proposers, the designer and the
    critic read it; the experimenter (profile and search results), the referee, the critic
    and, with ``cfg.lessons``, the reporter write it (candidate lessons, never reused here).

    Reviewed lessons: with ``cfg.lessons_corpus`` (a corpus saved by ``FrozenLessons.save``)
    and ``cfg.lessons_case_id`` (the held-out case this run declares), the run recalls that
    frozen corpus at its start: ``task9_lessons`` builds a ``memory.lessons.RunLessons`` on
    the local lesson ledger (no key, no network, every applicable lesson in corpus order) and
    it goes to ``Deps.lessons``, the swarm roles and the lab. The orchestrator loads it after
    the profile and before the proposals, emitting one ``memory.recalled`` per reader; the
    ledger under ``<run>/lessons/`` keeps the ``lesson.written`` and ``memory.recalled``
    audit rows. Each proposer persona's prompt and the delivery planner's prompt (it reads
    the designer's lessons, since the designer step is a code stand-in with no prompt) get
    their lessons as a delimited block. The public context for the ``requires``/``excludes``
    gates is ``{"task": TASK_ID, "analysis": "de_from_counts", "reader": <role>}``. A corpus
    that does not load or verify, a synthetic or empty corpus, or a case outside its held-out
    cohort raises here, before anything runs. Without a corpus nothing changes: no ledger,
    no recall and the same prompts.
    """
    from agents.llm import LLM, STRONG_MODEL, LLMConfig
    from agents.predictor import SampledPredictor
    from agents.swarm import SwarmRoles
    from core.orchestrator import Deps
    from execution.staging import COUNTS
    from memory.run import memory_from_config

    # Fail on a bad corpus or case before building anything that opens files or clients.
    lessons = task9_lessons(cfg)

    owns_search = False
    if not getattr(cfg, "search", False):
        search = None
    elif search is None:
        from search.task9 import build_task9_search

        search = build_task9_search(cfg)
        owns_search = search is not None

    if llm is None:
        config = LLMConfig()
        # The delivery code is the deliverable, so it gets the strong model.
        config.role_models.setdefault("deliverer", STRONG_MODEL)
        # $ per 1M tokens (input, output), so the run's $2 cap counts real spend.
        # Public list prices as of Nov 2026.
        for model, price in TASK9_PRICES.items():
            config.prices_per_mtok.setdefault(model, price)
        llm = LLM(config)
    lab = build_task9_lab(
        llm=llm,
        runs_dir=Path(cfg.runs_dir),
        case_dir=case_dir,
        manifest=manifest,
        search=search,
        owns_search=owns_search,
    )
    if memory is None:
        memory = memory_from_config(cfg, task_id=TASK_ID)
        lab.memory = memory
    counts = Path(case_dir) / COUNTS if case_dir is not None else None
    # The referee reads log files relative to the run folder, and the proposers recall under
    # the run id; the lab learns both in bind().
    roles = SwarmRoles(
        llm,
        cfg,
        memory=memory,
        run_id=lambda: lab.run_id,
        counts_path=counts,
        run_dir=lambda: lab.run_dir,
        lessons=lessons,
    )
    lab.lessons = lessons
    predictor: Any = SampledPredictor(llm, n=cfg.n_predictor_samples, eps=cfg.eps)
    if getattr(cfg, "predictor", None) == "tinker":
        from agents.tinker_predictor import TinkerPredictor, load_model_path

        path = load_model_path()
        if path is None:
            raise ValueError(
                'predictor="tinker" needs CRUX_TINKER_PREDICTOR (a tinker:// sampler path)'
            )
        # The sampled predictor stays as the fallback if Tinker errors mid-run.
        predictor = TinkerPredictor(
            path,
            profile=lambda: lab.profile_facts,
            eps=getattr(cfg, "eps", 0.1),
            fallback=predictor,
            # Opt in to let the model replace the library's stated rows.
            use_stated_rows=os.environ.get("CRUX_TINKER_OVERRIDE_STATED") != "1",
        )
    deps = Deps(
        agents=roles,
        predictor=predictor,
        memory=memory,
        search=search,
        llm=llm,
        lessons=lessons,
    )
    return lab, deps


def task9_lessons(cfg: Any) -> Any:
    """The run's ``RunLessons`` for ``cfg.lessons_corpus``, or ``None`` when no corpus is set.

    Readers are the proposer personas this config runs plus the designer. Raises when the
    corpus does not load, or the declared case is missing or outside the held-out cohort.
    """
    corpus = getattr(cfg, "lessons_corpus", None)
    case_id = getattr(cfg, "lessons_case_id", None)
    if not corpus:
        if case_id:
            raise ValueError("lessons_case_id is set but lessons_corpus is not")
        return None
    from agents.proposer import ROLES
    from memory.lessons import RunLessons

    personas = ROLES[: getattr(cfg, "proposers", len(ROLES))]
    return RunLessons(
        corpus,
        case_id,
        readers=(*personas, "designer"),
        context={"task": TASK_ID, "analysis": "de_from_counts"},
    )


def discover_cases(root: Path | None) -> dict[str, dict]:
    """Cases under ``root``: a folder with the counts and sample sheet runs locally; a
    staging manifest (``*.json`` with ``bundle_id``) runs on Modal. Nothing here reads an
    evaluator truth key, so splits are not known to the engine."""
    from execution.staging import COUNTS, SAMPLES

    cases: dict[str, dict] = {}
    if root is None or not Path(root).is_dir():
        return cases
    root = Path(root)
    for path in sorted(root.rglob("*")):
        if path.is_dir() and (path / COUNTS).is_file() and (path / SAMPLES).is_file():
            cases[path.relative_to(root).as_posix()] = {
                "kind": "local",
                "path": str(path),
            }
        elif (
            path.suffix == ".json" and path.is_file() and "evaluator" not in path.parts
        ):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, UnicodeDecodeError):
                continue
            if isinstance(data, dict) and "bundle_id" in data and "files" in data:
                cases[path.relative_to(root).with_suffix("").as_posix()] = {
                    "kind": "modal",
                    "path": str(path),
                }
    return cases
