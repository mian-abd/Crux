"""The real agent roles behind ``core.interfaces.AgentRoles``.

* ``propose``: Gavin's independent proposers plus the DU-42 fork library
  (``agents.proposer.propose``). The orchestrator owns events and the null option, so the
  proposer runs with a silent bus and ``null_hypothesis`` off; question ids it assigns are
  kept by the orchestrator. Each proposer recalls from the run's shared memory under the
  real run id (``run_id``) and its own role; records it already has in ``evidence`` (the
  profile) are dropped from that recall, so nothing reaches its prompt twice. With
  ``lessons`` (``memory.lessons.RunLessons``, loaded by the orchestrator before this call)
  each persona also gets the reviewed lessons it recalled, as a delimited prompt block.
* ``design``: stand-in until DU-10's designer lands. It returns the library diagnostics
  the proposer attached to the question, plus the pre-registered search diagnostics
  (``search.task9.search_diagnostics``) for questions that documentation can decide, such
  as DESeq2 defaults. The orchestrator drops the search ones when search is off. A
  question with no diagnostic gets none and ends unresolved.
* ``referee``/``critic``/``report``: DU-11 (``agents.referee``, ``agents.critic``,
  ``agents.reporter``), imported when first used so this module loads before they exist.
* ``regenerate``: stand-in, no new options (a surprise is still logged and the question is
  left to the null option).

Every collaborator can be injected, which is how the tests run without a model.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from core.schemas import (
    Artifact,
    CriticFinding,
    EngineState,
    Evidence,
    Experiment,
    Hypothesis,
    Observation,
    Question,
    Report,
    Trial,
)


class SilentBus:
    """What ``agents.proposer.propose`` needs from an EventBus, minus the events."""

    def __init__(self, run_id: str = "swarm") -> None:
        self.run_id = run_id
        self.path = Path("__no_events__.jsonl")
        self.events: list[tuple[str, dict]] = []

    async def emit(self, type_: str, payload: dict) -> None:
        self.events.append((type_, payload))


class NullMemory:
    async def write(self, ev: Evidence, run_id: str, author_role: str) -> None:
        return None

    async def recall(
        self, query: str, run_id: str, reader_role: str, k: int = 8
    ) -> list:
        return []


class _Unseen:
    """A memory view that hides records the caller already holds (by evidence id)."""

    def __init__(self, memory: Any, seen: set[str]) -> None:
        self.memory = memory
        self.seen = seen

    async def write(self, ev: Evidence, run_id: str, author_role: str) -> None:
        await self.memory.write(ev, run_id, author_role)

    async def recall(
        self, query: str, run_id: str, reader_role: str, k: int = 8
    ) -> list[Evidence]:
        found = await self.memory.recall(query, run_id, reader_role, k)
        return [e for e in found if e.id not in self.seen]


class SwarmRoles:
    def __init__(
        self,
        llm: Any,
        config: Any,
        *,
        memory: Any = None,
        run_id: Callable[[], str | None] | None = None,
        library: Callable[[dict], list] | None = None,
        propose_fn: Callable | None = None,
        referee_fn: Callable | None = None,
        critic_fn: Callable | None = None,
        report_fn: Callable | None = None,
        counts_path: Path | None = None,
        run_dir: Callable[[], Path | None] | None = None,
        search_library: Callable[[list[Question]], dict[str, list[Experiment]]]
        | None = None,
        lessons: Any = None,
    ) -> None:
        self.llm = llm
        self.config = config
        self.memory = memory or NullMemory()
        self.lessons = lessons
        self.run_id = run_id
        self.library = library
        self.search_library = search_library
        self.propose_fn = propose_fn
        self.referee_fn = referee_fn
        self.critic_fn = critic_fn
        self.report_fn = report_fn
        self.counts_path = counts_path
        self.run_dir = run_dir
        self.brief: dict = {}
        self.diagnostics: dict[str, list[Experiment]] = {}
        self.rounds = 0

    # --- proposers -------------------------------------------------------------------

    async def propose(
        self, brief: dict, evidence: list[Evidence]
    ) -> tuple[list[Question], list[Hypothesis]]:
        propose_fn = self.propose_fn
        if propose_fn is None:
            from agents.proposer import propose as propose_fn
        library = self.library
        if library is None:
            try:
                from diagnostics.de_from_counts.library import (
                    library_questions as library,
                )
            except ImportError:
                library = None
        self.brief = dict(brief)
        entries = library(brief) if library is not None else []
        self.rounds += 1
        cfg = self.config.model_copy(update={"null_hypothesis": False})
        # The proposer recalls under ``bus.run_id``; run-scoped memory needs the real one.
        run_id = (self.run_id() if self.run_id is not None else None) or f"round{self.rounds}"
        # Reviewed lessons, recalled per persona when the run started; passed only when the
        # run has a corpus, so a run without one calls the proposer exactly as before.
        extra: dict[str, Any] = {}
        if self.lessons is not None:
            extra["lessons"] = {
                role: self.lessons.for_role(role)
                for role in self.lessons.readers
                if role != "designer"
            }
        # The library's forks are pre-registered: fixed options, answer keys and
        # diagnostics. On the first real Task 9 run the merge model folded five of them and
        # unrelated questions into one 20-option question, so they skip the merge and are
        # added as their own questions; the proposers' own questions are merged as before.
        result = await propose_fn(
            brief,
            list(evidence),
            llm=self.llm,
            memory=_Unseen(self.memory, {e.id for e in evidence}),
            bus=SilentBus(run_id),
            config=cfg,
            library=[],
            **extra,
        )
        questions = list(result.questions)
        hypotheses = [h for h in result.hypotheses if not h.is_null]
        for exp in result.diagnostics:
            for qid in exp.question_ids:
                self.diagnostics.setdefault(qid, []).append(exp)
        for entry in entries:
            qid = f"library-{entry.key}"
            questions.append(
                Question(
                    id=qid,
                    text=entry.proposal.text,
                    kind="categorical",
                    impact=entry.proposal.impact,
                    raised_by="library",
                )
            )
            for i, option in enumerate(entry.proposal.options):
                hypotheses.append(
                    Hypothesis(
                        id=f"{qid}-h{i}",
                        question_id=qid,
                        statement=option.statement,
                        rationale=option.rationale,
                        answer_key=option.answer_key,
                        author="library",
                        prior=1.0,
                        posterior=1.0,
                    )
                )
            for i, diagnostic in enumerate(entry.diagnostics):
                self.diagnostics.setdefault(qid, []).append(
                    diagnostic.model_copy(
                        update={"id": f"{qid}-d{i}", "question_ids": [qid]}, deep=True
                    )
                )
        self._attach_search(questions)
        return questions, hypotheses

    def _attach_search(self, questions: list[Question]) -> None:
        """Pre-registered search diagnostics for the questions documentation can decide."""
        search_library = self.search_library
        if search_library is None:
            from search.task9 import search_diagnostics as search_library
        for qid, experiments in search_library(list(questions)).items():
            known = {e.id for e in self.diagnostics.get(qid, [])}
            for exp in experiments:
                if exp.id not in known:
                    self.diagnostics.setdefault(qid, []).append(exp)

    async def regenerate(
        self, question: Question, hypotheses: list[Hypothesis], history: list[Trial]
    ) -> list[Hypothesis]:
        return []

    # --- designer (stand-in for DU-10) -----------------------------------------------

    async def design(
        self,
        question: Question,
        hypotheses: list[Hypothesis],
        evidence: list[Evidence],
        history: list[Trial],
    ) -> list[Experiment]:
        return [
            exp.model_copy(deep=True) for exp in self.diagnostics.get(question.id, [])
        ]

    # --- DU-11 -----------------------------------------------------------------------

    async def referee(
        self, experiment: Experiment, observation: Observation
    ) -> tuple[bool, str]:
        fn = self.referee_fn
        if fn is None:
            from agents.referee import referee as fn
        run_dir = self.run_dir() if self.run_dir is not None else None
        return await fn(self.llm, experiment, observation, run_dir=run_dir)

    async def critic(
        self, artifacts: list[Artifact], contract: dict
    ) -> list[CriticFinding]:
        fn = self.critic_fn
        if fn is None:
            from agents.critic import critique as fn
        return await fn(
            self.llm,
            artifacts,
            contract,
            counts_path=self.counts_path,
            brief=self.brief,
        )

    async def report(self, state: EngineState, artifacts: list[Artifact]) -> Report:
        fn = self.report_fn
        if fn is None:
            from agents.reporter import report as fn
        return await fn(self.llm, state, artifacts)
