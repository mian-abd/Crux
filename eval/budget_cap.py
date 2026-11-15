"""A spend cap shared by every run in one evaluation launch.

Before a run starts it reserves the most it can cost (``RUN_CAP_USD``, the per-run cap both
arms enforce). A reservation is granted only while finished spend plus every in-flight
reservation plus the new one stays within ``max_total_usd``. When a run ends its reservation
is replaced by its real cost, or kept whole when the cost is unknown. The first refusal stops
the launch: that run and every later one is recorded as ``NOT_RUN_BUDGET``, never dropped.

With a ledger file the state survives between processes, so several ``run_task9_arms`` jobs
run one after another share one cap. A reservation left in the ledger by a process that died
is charged in full when the ledger is next opened, since its real cost is unknown.
"""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from pathlib import Path

RUN_CAP_USD = 2.0
NOT_RUN_BUDGET = "not run: budget"


class BudgetCap:
    def __init__(
        self,
        max_total_usd: float | None,
        *,
        run_cap_usd: float = RUN_CAP_USD,
        ledger: Path | None = None,
    ) -> None:
        if max_total_usd is not None and max_total_usd < 0:
            raise ValueError("max_total_usd must be zero or more")
        if run_cap_usd <= 0:
            raise ValueError("run_cap_usd must be positive")
        self.max_total_usd = max_total_usd
        self.run_cap_usd = run_cap_usd
        self.ledger = ledger
        self._lock = threading.Lock()
        self.finished: dict[str, float] = {}
        self.in_flight: dict[str, float] = {}
        self.skipped: list[str] = []
        self.stopped = False
        if ledger is not None and ledger.is_file():
            self._load(json.loads(ledger.read_text(encoding="utf-8")))

    def _load(self, state: dict) -> None:
        recorded_cap = state.get("max_total_usd")
        if recorded_cap != self.max_total_usd:
            raise ValueError(
                f"budget ledger {self.ledger} was opened with cap {recorded_cap}, "
                f"not {self.max_total_usd}"
            )
        self.finished = {k: float(v) for k, v in state.get("finished", {}).items()}
        # Reservations of a process that died: the real cost is unknown, so charge them whole.
        for run_id, reserved in state.get("in_flight", {}).items():
            self.finished[run_id] = float(reserved)
        self.skipped = list(state.get("skipped", []))
        self.stopped = bool(state.get("stopped", False))

    @property
    def spent_usd(self) -> float:
        return sum(self.finished.values())

    @property
    def reserved_usd(self) -> float:
        return sum(self.in_flight.values())

    def reserve(self, run_id: str) -> bool:
        """Reserve ``run_cap_usd`` for ``run_id``; False (and the launch stops) if it would pass."""
        with self._lock:
            if run_id in self.in_flight or run_id in self.finished:
                raise ValueError(f"run {run_id} already has a budget entry")
            fits = (
                self.max_total_usd is None
                or self.spent_usd + self.reserved_usd + self.run_cap_usd
                <= self.max_total_usd + 1e-9
            )
            if self.stopped or not fits:
                self.stopped = True
                self.skipped.append(run_id)
                self._save()
                return False
            self.in_flight[run_id] = self.run_cap_usd
            self._save()
            return True

    def settle(self, run_id: str, cost_usd: float | None) -> None:
        """Replace the run's reservation with its real cost (the whole reservation if unknown)."""
        with self._lock:
            reserved = self.in_flight.pop(run_id)
            self.finished[run_id] = reserved if cost_usd is None else float(cost_usd)
            self._save()

    def snapshot(self) -> dict:
        return {
            "max_total_usd": self.max_total_usd,
            "run_cap_usd": self.run_cap_usd,
            "spent_usd": round(self.spent_usd, 6),
            "reserved_usd": round(self.reserved_usd, 6),
            "stopped": self.stopped,
            "finished": dict(self.finished),
            "in_flight": dict(self.in_flight),
            "skipped": list(self.skipped),
            "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }

    def _save(self) -> None:
        if self.ledger is None:
            return
        self.ledger.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.ledger.with_name(self.ledger.name + ".tmp")
        temporary.write_text(json.dumps(self.snapshot(), indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.ledger)
