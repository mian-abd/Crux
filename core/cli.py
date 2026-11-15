"""Run a lab end to end: the offline fakes, the claims audit, or a Task 9 case with the swarm.

    python -m core.cli --lab fake|fake-surprise|fake-numeric --config default --seed 0 --runs-dir runs
    python -m core.cli --lab bixbench3 --manifest case-manifest.json   # Modal sandbox
    python -m core.cli --lab bixbench3 --case path/to/case             # this machine, dev only
    python -m core.cli --lab bixbench3 --manifest m.json --lessons corpus.json --lessons-case-id case-01
    python -m core.cli --lab claims --run-id claims-demo                # 4 curated DESeq2 claims

Prints the run id, the number of events, which questions settled (or ended robust or
unresolved) and the path of the events file. The fakes need no network access and no API
key, and neither does ``claims`` (its symbolic and simulation diagnostics run on this
machine; see docs/CLAIMS.md). ``bixbench3`` calls the models (OPENAI_API_KEY), with
``--manifest`` Modal, and with PAST_API_KEY set past.dev for the agents' shared memory
(``--config`` picks the arm).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

from core.config import PRESETS, load_config
from core.fakes_engine import (
    FakeClock,
    FakeLab,
    FakeNumericLab,
    FakeSurpriseLab,
    fake_deps,
)
from core.orchestrator import run

FAKE_LABS: dict[str, type[FakeLab | FakeNumericLab]] = {
    "fake": FakeLab,
    "fake-surprise": FakeSurpriseLab,
    "fake-numeric": FakeNumericLab,
}
LABS = (*FAKE_LABS, "bixbench3", "claims")


def make_lab(name: str, seed: int = 0, latency_s: float = 0.0) -> FakeLab | FakeNumericLab:
    """Build a fake lab by its CLI name."""
    if name not in FAKE_LABS:
        raise ValueError(f"unknown lab {name!r}; choose from {', '.join(LABS)}")
    return FAKE_LABS[name](seed=seed, latency_s=latency_s)


def summarise(events_path: Path) -> dict[str, list[str]]:
    """Question id -> outcome lines, read back from the event file."""
    outcome: dict[str, list[str]] = {
        "settled": [],
        "robust": [],
        "unresolved": [],
    }
    for line in events_path.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        p = event["payload"]
        if event["type"] == "question.settled":
            outcome["settled"].append(
                f"{p['question_id']} -> {p['hypothesis_id']} ({p['posterior']:.3f})"
            )
        elif event["type"] == "question.robust":
            outcome["robust"].append(f"{p['question_id']} -> {p['answer_key']}")
        elif event["type"] == "question.unresolved":
            outcome["unresolved"].append(f"{p['question_id']}: {p['reason']}")
    return outcome


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m core.cli", description=__doc__.split("\n")[0])
    parser.add_argument("--lab", choices=LABS, default="fake")
    parser.add_argument("--config", choices=sorted(PRESETS), default="default")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--runs-dir", default="runs")
    parser.add_argument("--run-id", default=None)
    parser.add_argument(
        "--fake-clock", action="store_true", help="use a deterministic clock (reproducible files)"
    )
    where = parser.add_mutually_exclusive_group()
    where.add_argument("--manifest", type=Path, help="bixbench3: staged case manifest (Modal)")
    where.add_argument(
        "--case", type=Path, help="bixbench3: case folder run on this machine (dev only)"
    )
    parser.add_argument(
        "--lessons",
        type=Path,
        metavar="CORPUS",
        help="bixbench3: frozen lesson corpus (FrozenLessons.save) recalled at the run's start",
    )
    parser.add_argument(
        "--lessons-case-id",
        metavar="CASE",
        help="bixbench3 with --lessons: the held-out case id this run declares",
    )
    args = parser.parse_args(argv)

    lessons: dict[str, str] = {}
    if args.lessons is not None or args.lessons_case_id is not None:
        if args.lab != "bixbench3":
            parser.error("--lessons is for --lab bixbench3")
        if args.lessons is None or not args.lessons_case_id:
            parser.error("--lessons and --lessons-case-id go together")
        lessons = {"lessons_corpus": str(args.lessons), "lessons_case_id": args.lessons_case_id}
    cfg = load_config(args.config, seed=args.seed, runs_dir=args.runs_dir, **lessons)
    if args.lab == "bixbench3":
        if args.manifest is None and args.case is None:
            parser.error("--lab bixbench3 needs --manifest or --case")
        from labs.bixbench3.swarm_lab import build_task9_run

        lab, deps = build_task9_run(cfg, case_dir=args.case, manifest=args.manifest)
    elif args.lab == "claims":
        from labs.claims.lab import build_claims_run

        lab, deps = build_claims_run(cfg, clock=FakeClock() if args.fake_clock else time.time)
    else:
        lab = make_lab(args.lab, seed=args.seed)
        deps = fake_deps(lab, seed=args.seed, clock=FakeClock() if args.fake_clock else time.time)
    report = asyncio.run(run(lab, cfg, deps, run_id=args.run_id))

    events_path = Path(args.runs_dir) / report.run_id / "events.jsonl"
    n_events = sum(1 for line in events_path.read_text(encoding="utf-8").splitlines() if line)
    outcome = summarise(events_path)
    print(f"run id:     {report.run_id}")
    print(f"events:     {n_events}")
    for key in ("settled", "robust", "unresolved"):
        print(f"{key + ':':<11} {'; '.join(outcome[key]) or '-'}")
    fake = " (fake)" if args.lab in FAKE_LABS else ""
    print(f"cost:       ${report.cost_usd:.4f}{fake}")
    if report.artifacts:
        print(f"artifacts:  {', '.join(a.name for a in report.artifacts)}")
    print(f"events at:  {events_path.as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
