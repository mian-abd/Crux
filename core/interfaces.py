"""Structural interfaces for the v2 engine and interchangeable adapters."""

from pathlib import Path
from typing import Protocol, runtime_checkable

from pydantic import BaseModel

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


class RunState(Protocol):
    """Opaque orchestrator state passed through to the lab for delivery."""


class Lab(Protocol):
    name: str

    def brief(self) -> dict: ...

    async def profile(self) -> list[Evidence]: ...

    def candidate_designs(self) -> list[dict] | None: ...

    async def run(self, exp: Experiment) -> Observation: ...

    async def deliver(self, state: "RunState") -> list[Artifact]: ...


class Executor(Protocol):
    async def open(self, lab_name: str, run_id: str) -> str: ...

    async def exec(
        self, sandbox_id: str, language: str, code: str, timeout_s: int = 120
    ) -> dict: ...

    async def close(self, sandbox_id: str) -> None: ...


class LLM(Protocol):
    async def structured(
        self, role: str, schema: type[BaseModel], messages: list[dict], n: int = 1
    ) -> list[BaseModel]: ...


class Predictor(Protocol):
    async def predict(
        self, exp: Experiment, hypotheses: list[Hypothesis], context: str
    ) -> dict[str, dict[str, float]]: ...


class Memory(Protocol):
    async def write(self, ev: Evidence, run_id: str, author_role: str) -> None: ...

    async def recall(
        self, query: str, run_id: str, reader_role: str, k: int = 8
    ) -> list[Evidence]: ...


class Search(Protocol):
    async def find(self, query: str, k: int = 5) -> list[Evidence]: ...


# --- engine additions ----------------------------------------------------------------
# Appended for the orchestrator; nothing above this line changed.


class LabHooks(Protocol):
    """Optional lab methods. The orchestrator calls them only when the lab defines them.

    ``bind`` runs right after ``run.started``: it tells the lab its run id, its run
    directory (``<runs_dir>/<run_id>``, for logs and artifacts) and the executor from
    ``Deps``. ``close`` runs once at the end of every run, successful or not.

    ``Observation.log_ref``, when set, names a text file (absolute, or relative to the run
    directory) whose lines the orchestrator streams as ``experiment.log`` events. Lines
    starting with ``[stderr] `` go to the stderr stream.

    ``opening_events`` returns ``(type, payload)`` pairs that the orchestrator emits right
    after ``run.started``, before ``bind``. Each type must be in
    ``core.events.LAB_EVENT_TYPES`` (for example ``claims.source``).
    """

    def opening_events(self) -> list[tuple[str, dict]]: ...

    def bind(self, run_id: str, run_dir: Path, executor: Executor | None) -> None: ...

    async def close(self) -> None: ...


@runtime_checkable
class AgentRoles(Protocol):
    """The LLM roles the orchestrator calls. All methods are async and may call a model.

    The orchestrator owns every hard rule: ids, priors, the null option, likelihood
    filling, scoring, Bayes updates, rejection, settling, budgets and events. Agents only
    propose, design, judge and write. ``state`` is the orchestrator's
    ``core.schemas.EngineState``.
    """

    async def propose(
        self, brief: dict, evidence: list[Evidence]
    ) -> tuple[list[Question], list[Hypothesis]]:
        """Proposers: the questions in dispute and their options.

        Each hypothesis names its ``question_id``; ``prior`` is a relative weight (exact
        duplicates are merged and their weights summed). Do not add the null option. For
        ``kind="model"`` questions, give ``model_code`` or match the lab's family names
        via ``id`` or ``answer_key``.
        """
        ...

    async def design(
        self,
        question: Question,
        hypotheses: list[Hypothesis],
        evidence: list[Evidence],
        history: list[Trial],
    ) -> list[Experiment]:
        """Designer: candidate diagnostics for one question.

        Each experiment has two or more bins with code-evaluable rules and its ``code``,
        ``query`` or ``design`` filled. ``likelihood`` may stay empty: the predictor fills
        it (for the ``stated`` ablation the designer fills it). ``hypotheses`` are the
        active real options; ``history`` the question's valid trials.
        """
        ...

    async def referee(
        self,
        experiment: Experiment,
        observation: Observation,
    ) -> tuple[bool, str]:
        """Referee: did the run actually test what it claimed? ``(valid, note)``."""
        ...

    async def critic(
        self,
        artifacts: list[Artifact],
        contract: dict,
    ) -> list[CriticFinding]:
        """Critic: check the delivered artifacts against the deliverable contract.

        ``contract`` is the lab's ``brief()["contract"]`` plus, when memory recalled
        records for the critic, ``contract["recalled_evidence"]``. A ``block`` finding
        triggers a repair round; ``reopens_question`` also reopens that question first.
        """
        ...

    async def report(self, state: EngineState, artifacts: list[Artifact]) -> Report:
        """Reporter: the methods write-up. The orchestrator overwrites the run id, the
        artifact list, the rejected ledger, the unresolved list, cost and time."""
        ...

    async def regenerate(
        self, question: Question, hypotheses: list[Hypothesis], history: list[Trial]
    ) -> list[Hypothesis]:
        """Proposers, after a surprise: new options that could explain every outcome.

        The orchestrator keeps only the options consistent with all of ``history`` and
        then replays the evidence over the new option set.
        """
        ...
