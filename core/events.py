"""Single-writer run logs and live subscriptions for one asyncio event loop."""

import asyncio
import math
import re
import secrets
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from core.schemas import RunEvent


class EventBus:
    """One instance owns one new run. Subscribers receive future events in file order."""

    def __init__(
        self,
        run_id: str,
        root: Path = Path("runs"),
        *,
        clock: Callable[[], float] = time.time,
    ):
        if not re.fullmatch(r"[a-zA-Z0-9_-][a-zA-Z0-9._-]*", run_id):
            raise ValueError("run_id must be a single directory name")
        self.run_id = run_id
        self.path = root / run_id / "events.jsonl"
        self._clock = clock
        self._seq = 0
        self._closed = False
        self._subscribers: set[asyncio.Queue[RunEvent]] = set()

    async def emit(self, event_type: str, payload: dict) -> RunEvent:
        if self._closed:
            raise ValueError("run has already ended")
        if (self._seq == 0) != (event_type == "run.started"):
            raise ValueError("run.started must appear exactly once, first")
        event = RunEvent(
            run_id=self.run_id,
            seq=self._seq,
            ts=self._clock(),
            type=event_type,
            payload=payload,
        )
        line = event.model_dump_json()
        event = RunEvent.model_validate_json(line)
        # No await between assigning the sequence, persisting it, and notifying readers.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open(
            "x" if self._seq == 0 else "a", encoding="utf-8", newline="\n"
        ) as log:
            log.write(line + "\n")
        self._seq += 1
        self._closed = event_type in {"run.finished", "run.error"}
        for queue in self._subscribers:
            queue.put_nowait(event.model_copy(deep=True))
        return event

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[AsyncIterator[RunEvent]]:
        """Register on context entry and release the queue even if the reader cancels."""
        queue: asyncio.Queue[RunEvent] = asyncio.Queue()
        already_closed = self._closed
        self._subscribers.add(queue)

        async def stream() -> AsyncIterator[RunEvent]:
            if already_closed:
                return
            while True:
                event = await queue.get()
                yield event
                if event.type in {"run.finished", "run.error"}:
                    return

        try:
            yield stream()
        finally:
            self._subscribers.discard(queue)


# --- engine additions ----------------------------------------------------------------
# Appended for the orchestrator; nothing above this line changed. One constant per event
# type in docs/EVENTS.md, plus helpers for run ids and JSON-safe payloads.

RUN_STARTED = "run.started"
PROFILE_DONE = "profile.done"
QUESTION_OPENED = "question.opened"
HYPOTHESIS_PROPOSED = "hypothesis.proposed"
HYPOTHESIS_MERGED = "hypothesis.merged"
EXPERIMENT_PROPOSED = "experiment.proposed"
EXPERIMENT_SCORED = "experiment.scored"
EXPERIMENT_STARTED = "experiment.started"
EXPERIMENT_LOG = "experiment.log"
EXPERIMENT_FINISHED = "experiment.finished"
REFEREE_VERDICT = "referee.verdict"
BELIEF_UPDATED = "belief.updated"
MODEL_CURVES = "model.curves"
HYPOTHESIS_REJECTED = "hypothesis.rejected"
QUESTION_SETTLED = "question.settled"
QUESTION_ROBUST = "question.robust"
QUESTION_UNRESOLVED = "question.unresolved"
SURPRISE_RAISED = "surprise.raised"
SEARCH_DONE = "search.done"
MEMORY_WRITTEN = "memory.written"
MEMORY_RECALLED = "memory.recalled"
ARTIFACT_WRITTEN = "artifact.written"
CRITIC_FINDING = "critic.finding"
LESSON_WRITTEN = "lesson.written"
BUDGET_TICK = "budget.tick"
RUN_FINISHED = "run.finished"
RUN_ERROR = "run.error"

EVENT_TYPES: tuple[str, ...] = (
    RUN_STARTED,
    PROFILE_DONE,
    QUESTION_OPENED,
    HYPOTHESIS_PROPOSED,
    HYPOTHESIS_MERGED,
    EXPERIMENT_PROPOSED,
    EXPERIMENT_SCORED,
    EXPERIMENT_STARTED,
    EXPERIMENT_LOG,
    EXPERIMENT_FINISHED,
    REFEREE_VERDICT,
    BELIEF_UPDATED,
    MODEL_CURVES,
    HYPOTHESIS_REJECTED,
    QUESTION_SETTLED,
    QUESTION_ROBUST,
    QUESTION_UNRESOLVED,
    SURPRISE_RAISED,
    SEARCH_DONE,
    MEMORY_WRITTEN,
    MEMORY_RECALLED,
    ARTIFACT_WRITTEN,
    CRITIC_FINDING,
    LESSON_WRITTEN,
    BUDGET_TICK,
    RUN_FINISHED,
    RUN_ERROR,
)
TERMINAL_EVENTS: tuple[str, ...] = (RUN_FINISHED, RUN_ERROR)

# Lab events: emitted by the orchestrator for one lab only (``LabHooks.opening_events``)
# and documented in that lab's section of docs/EVENTS.md, not in the core table.
CLAIMS_SOURCE = "claims.source"  # the claims lab's source paper and claims, after run.started
LAB_EVENT_TYPES: tuple[str, ...] = (CLAIMS_SOURCE,)
EVENTS_FILE = "events.jsonl"


def new_run_id(now: datetime | None = None) -> str:
    """A fresh run id: ``r-YYYYMMDD-HHMMSS-xxxx`` (local time, four random hex digits)."""
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    return f"r-{stamp}-{secrets.token_hex(2)}"


def jsonable(obj: Any) -> Any:
    """Convert a payload to plain JSON values before ``EventBus.emit``.

    Pydantic models use ``model_dump(mode="json")``. Numpy scalars and arrays become
    Python numbers and lists, paths become POSIX strings, sets become sorted lists, and
    non-finite floats become ``None`` so every line stays valid JSON for the browser.
    """
    if isinstance(obj, BaseModel):
        return jsonable(obj.model_dump(mode="json"))
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, (set, frozenset)):
        return [jsonable(v) for v in sorted(obj, key=str)]
    if isinstance(obj, bool) or obj is None or isinstance(obj, str):
        return obj
    if isinstance(obj, int):
        return int(obj)
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, Enum):
        return jsonable(obj.value)
    if isinstance(obj, Path):
        return obj.as_posix()
    tolist = getattr(obj, "tolist", None)  # numpy scalars and arrays
    if callable(tolist):
        return jsonable(tolist())
    return str(obj)
