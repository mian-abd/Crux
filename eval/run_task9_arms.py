"""Run the swarm and the single-agent baseline on Task 9 several times, then grade every run.

    uv run python -m eval.run_task9_arms --manifest ../data/task9/task9-clean.json \
        --evaluator ../evaluator/task9 --grader-repo ../evaluator/BixBench3 \
        --grader-python ../evaluator/grader-venv/Scripts/python.exe \
        --out ../evaluator/results/batch-01 --repeats 3

Every run starts in parallel, each in its own Modal sandbox, on the same staged inputs, the
same prompt (``load_prompt``), the same grader and the same caps ($2 and 40 model calls).
The swarm uses the run configuration in ``core.config``; the baseline uses ``--baseline-model``
at the given list prices. Grades land in ``--out``, which must be evaluator storage outside
the repo and outside every run folder. ``results.md`` and ``results.json`` there hold every
run (failed ones included) and each arm's mean and spread.

Lessons on/off: ``--arms swarm swarm-lessons --lessons CORPUS`` runs, per case, the plain
swarm and the swarm that recalls the frozen lesson corpus at its start (``core.cli
--lessons CORPUS --lessons-case-id <case name>``), and adds a paired on-minus-off table.
Every case name must be in the corpus's held-out cohort; that and the corpus are checked
before any run starts. The baseline never gets lessons.

``swarm-random`` is the swarm with random experiment selection (``core.cli --config
crux_random_selection``), the ablation of the EIG ranking.

Spend cap: ``--max-total-usd`` caps the whole launch (``eval.budget_cap``). Each run reserves
its $2 cap before it starts; once finished spend plus in-flight reservations would pass the
cap, that run and every later one is recorded as "not run: budget". ``--budget-ledger`` keeps
the cap's state in a file, so several invocations run one after another share one cap.

Independent runs: every run gets its own LLM disk cache, ``<runs-dir>/<run_id>/.cache/llm``
(``CRUX_LLM_CACHE_DIR``), so repeats of one case never replay each other's answers.

Each run is graded as soon as it ends and ``results.json``/``results.md`` are rewritten after
every run (``"complete": false`` until the last one), so a cut-off launch keeps what finished.
``CRUX_GIT_COMMIT`` overrides ``git rev-parse HEAD`` where there is no ``.git`` (the cloud).
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from agents.llm import CACHE_DIR_ENV
from eval.budget_cap import NOT_RUN_BUDGET, BudgetCap

PRICES = {"gpt-5.5": ("5.00", "30.00"), "gpt-4.1-mini": ("0.40", "1.60")}


def git_commit() -> str:
    pinned = os.environ.get("CRUX_GIT_COMMIT")
    if pinned:
        return pinned
    return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()


# Tool keys stripped from every run unless --with-tools: both arms then get the same tools
# (no web search, no shared memory), and search or memory become separate, labelled runs.
TOOL_KEYS = ("EXA_API_KEY", "PAST_API_KEY")
# ``swarm-lessons`` is the swarm with a frozen lesson corpus (--lessons) recalled at the
# start of each run; it needs no tool key, and ``swarm`` and ``baseline`` stay unchanged.
# ``swarm-random`` is the swarm with random experiment selection instead of EIG.
SWARM_ARMS = ("swarm", "swarm-lessons", "swarm-random")
ARMS = (*SWARM_ARMS, "baseline")
LESSON_PAIR = ("swarm", "swarm-lessons")  # the paired lessons on/off comparison


def check_lessons(args: argparse.Namespace, cases: dict[str, str]) -> dict | None:
    """Validate --lessons against the arms and cases before any run starts.

    Returns the corpus record for the report, or ``None`` without lessons. Exits when the
    corpus does not load or verify, is synthetic or empty, or a case is not in its held-out
    cohort, so no run is launched that would fail, or run with no lessons, later.
    """
    wants = "swarm-lessons" in args.arms
    if args.lessons is None:
        if wants:
            raise SystemExit("the swarm-lessons arm needs --lessons CORPUS")
        return None
    if not wants:
        raise SystemExit("--lessons applies to the swarm-lessons arm; add it to --arms")
    from memory.lessons import FrozenLessons

    try:
        corpus = FrozenLessons.load(args.lessons)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"cannot load the lesson corpus {args.lessons}: {exc}") from exc
    if corpus.synthetic or not corpus.lessons:
        raise SystemExit("the lesson corpus must be a real, non-empty reviewed corpus")
    outside = sorted(set(cases) - set(corpus.held_out_case_ids))
    if outside:
        raise SystemExit(
            f"cases not in the corpus's held-out cohort: {', '.join(outside)} "
            f"(cohort: {', '.join(corpus.held_out_case_ids)})"
        )
    return {
        "path": str(args.lessons),
        "sha256": corpus.digest,
        "frozen_at": corpus.frozen_at.isoformat(),
        "lesson_ids": [lesson.id for lesson in corpus.lessons],
        "held_out_case_ids": list(corpus.held_out_case_ids),
    }


def arm_command(
    arm: str, case: str, manifest: Path, run_id: str, args: argparse.Namespace
) -> list[str]:
    """The command line of one run of ``arm`` on ``case``."""
    if arm in SWARM_ARMS:
        command = [
            sys.executable,
            "-m",
            "core.cli",
            "--lab",
            "bixbench3",
            "--manifest",
            str(manifest),
            "--runs-dir",
            str(args.runs_dir),
            "--run-id",
            run_id,
        ]
        if arm == "swarm-lessons":
            # The case name is the held-out case id the run declares to the corpus.
            command += ["--lessons", str(args.lessons), "--lessons-case-id", case]
        elif arm == "swarm-random":
            command += ["--config", "crux_random_selection"]
        return command
    if arm != "baseline":
        raise ValueError(f"unknown arm {arm!r}; choose from {', '.join(ARMS)}")
    rate_in, rate_out = PRICES[args.baseline_model]
    return [
        sys.executable,
        "-m",
        "eval.baseline_agent",
        "--manifest",
        str(manifest),
        "--run-id",
        run_id,
        "--runs-dir",
        str(args.runs_dir),
        "--model",
        args.baseline_model,
        "--input-rate",
        rate_in,
        "--output-rate",
        rate_out,
    ]


def run_env(run_id: str, args: argparse.Namespace) -> dict[str, str]:
    """The environment of one run: no tool keys unless --with-tools, and its own LLM cache."""
    env = dict(os.environ)
    if not args.with_tools:
        for key in TOOL_KEYS:
            env.pop(key, None)
    env[CACHE_DIR_ENV] = str(Path(args.runs_dir) / run_id / ".cache" / "llm")
    return env


def run_arm(
    arm: str,
    case: str,
    manifest: Path,
    run_id: str,
    args: argparse.Namespace,
    logs: Path,
) -> dict:
    command = arm_command(arm, case, manifest, run_id, args)
    started = datetime.now()
    with (logs / f"{run_id}.log").open("w", encoding="utf-8") as log:
        done = subprocess.run(
            command,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=False,
            env=run_env(run_id, args),
        )
    return {
        "arm": arm,
        "case": case,
        "run_id": run_id,
        "exit_code": done.returncode,
        "seconds": (datetime.now() - started).total_seconds(),
        **run_cost(arm, run_id, Path(args.runs_dir)),
    }


def skipped_run(arm: str, case: str, run_id: str) -> dict:
    """The row of a run the spend cap stopped before it started."""
    return {
        "arm": arm,
        "case": case,
        "run_id": run_id,
        "exit_code": None,
        "seconds": 0.0,
        "cost_usd": None,
        "model_calls": None,
        "status": NOT_RUN_BUDGET,
        "mean": None,
        "passed": None,
    }


def run_and_grade(
    job: tuple[str, str, Path, str],
    args: argparse.Namespace,
    logs: Path,
    budget: BudgetCap,
) -> dict:
    """Reserve the run's cap, run it, settle its real cost and grade it."""
    arm, case, manifest, run_id = job
    if not budget.reserve(run_id):
        print(f"not run (budget): {run_id}", flush=True)
        return skipped_run(arm, case, run_id)
    cost = None
    try:
        run = run_arm(arm, case, manifest, run_id, args, logs)
        cost = run["cost_usd"]
    finally:
        budget.settle(run_id, cost)
    print(
        f"finished {run['run_id']}: exit {run['exit_code']}, {run['status']}, "
        f"{run['seconds']:.0f}s",
        flush=True,
    )
    return grade(run, args)


def run_cost(arm: str, run_id: str, runs_dir: Path = Path("runs")) -> dict:
    folder = runs_dir / run_id
    try:
        if arm == "baseline":
            report = json.loads((folder / "baseline.json").read_text(encoding="utf-8"))
            return {
                "cost_usd": float(report.get("usd_unadjusted_for_cache", 0)),
                "model_calls": report.get("calls"),
                "status": report.get("status"),
            }
        events = [
            json.loads(x)
            for x in (folder / "events.jsonl").read_text(encoding="utf-8").splitlines()
        ]
        ticks = [e["payload"] for e in events if e["type"] == "budget.tick"]
        last = events[-1]
        status = (
            last["payload"].get("status")
            if last["type"] == "run.finished"
            else last["type"]
        )
        return {
            "cost_usd": ticks[-1]["cost_usd"] if ticks else None,
            "model_calls": ticks[-1]["llm_calls"] if ticks else None,
            "status": status,
        }
    except (OSError, ValueError, KeyError, IndexError):
        return {"cost_usd": None, "model_calls": None, "status": "no record"}


def grade(run: dict, args: argparse.Namespace) -> dict:
    artifacts = Path(args.runs_dir) / run["run_id"] / "artifacts"
    out = args.out / run["run_id"]
    done = subprocess.run(
        [
            sys.executable,
            "-m",
            "eval.grade_bixbench3",
            "--task",
            "9",
            "--artifacts-dir",
            str(artifacts),
            "--references",
            str(args.evaluator),
            "--output-dir",
            str(out),
            "--grader-repo",
            str(args.grader_repo),
            "--python",
            str(args.grader_python),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if done.returncode != 0 or not (out / "grade.json").is_file():
        return {
            **run,
            "mean": None,
            "passed": None,
            "grade_error": done.stderr.strip()[-300:],
        }
    result = json.loads((out / "grade.json").read_text(encoding="utf-8"))
    return {
        **run,
        "mean": result["mean"],
        "passed": result["fraction_at_least_0_80"],
        "artifacts": {k: v["score"] for k, v in result["artifacts"].items()},
    }


def ran(row: dict) -> bool:
    """False for a run the spend cap stopped: it never started, so it is not a 0."""
    return row.get("status") != NOT_RUN_BUDGET


def summarise(rows: list[dict]) -> dict:
    out = {}
    for arm in sorted({r["arm"] for r in rows}):
        scores = [
            r["mean"] if r["mean"] is not None else 0.0
            for r in rows
            if r["arm"] == arm and ran(r)
        ]
        costs = [
            r["cost_usd"]
            for r in rows
            if r["arm"] == arm and ran(r) and r["cost_usd"] is not None
        ]
        out[arm] = {
            "runs": len(scores),
            "not_run_budget": sum(1 for r in rows if r["arm"] == arm and not ran(r)),
            "mean": statistics.mean(scores) if scores else None,
            "sd": statistics.stdev(scores) if len(scores) > 1 else 0.0,
            "min": min(scores) if scores else None,
            "max": max(scores) if scores else None,
            "mean_cost_usd": statistics.mean(costs) if costs else None,
        }
    return out


def _fmt(value: float | None, spec: str = ".3f", missing: str = "-") -> str:
    return missing if value is None else format(value, spec)


def paired_lessons(rows: list[dict]) -> list[dict]:
    """Per case with both swarm arms: mean score with lessons minus without (failed = 0)."""
    out = []
    for case in sorted({r["case"] for r in rows}):
        means = {}
        for arm in LESSON_PAIR:
            scores = [
                r["mean"] if r["mean"] is not None else 0.0
                for r in rows
                if r["case"] == case and r["arm"] == arm and ran(r)
            ]
            if scores:
                means[arm] = statistics.mean(scores)
        if len(means) == 2:
            out.append(
                {
                    "case": case,
                    "swarm": means["swarm"],
                    "swarm_lessons": means["swarm-lessons"],
                    "delta_on_minus_off": means["swarm-lessons"] - means["swarm"],
                }
            )
    return out


def write_report(
    rows: list[dict],
    summary: dict,
    args: argparse.Namespace,
    commit: str,
    lessons: dict | None = None,
    *,
    budget: dict | None = None,
    complete: bool = True,
) -> None:
    lines = [
        f"# Task 9: swarm vs single-agent baseline ({args.out.name})",
        "",
        (
            f"Code at commit `{commit}`. Inputs: `{args.manifest.name}`. "
            f"Baseline model: `{args.baseline_model}`. "
            "Failed or ungraded runs count as 0 in the means; runs the spend cap stopped "
            "before they started are listed but left out."
        ),
        "",
    ]
    if not complete:
        lines += ["**Partial: runs are still going; this file is rewritten after each one.**", ""]
    if budget is not None and budget.get("max_total_usd") is not None:
        lines += [
            (
                f"Spend cap ${budget['max_total_usd']:.2f} for the launch: "
                f"${budget['spent_usd']:.2f} spent, ${budget['reserved_usd']:.2f} reserved "
                f"by runs in flight, {len(budget['skipped'])} runs not run."
            ),
            "",
        ]
    lines += [
        "| Arm | Runs | Not run (budget) | Mean score | SD | Min | Max | Mean cost |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for arm, s in summary.items():
        cost = f"${s['mean_cost_usd']:.2f}" if s["mean_cost_usd"] is not None else "n/a"
        lines.append(
            f"| {arm} | {s['runs']} | {s['not_run_budget']} | {_fmt(s['mean'])} | "
            f"{_fmt(s['sd'])} | {_fmt(s['min'])} | {_fmt(s['max'])} | {cost} |"
        )
    lines += [
        "",
        "| Run | Arm | Status | Score | ≥0.80 | Cost | Calls | Seconds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        score = f"{r['mean']:.3f}" if r["mean"] is not None else "not graded"
        passed = f"{r['passed']:.2f}" if r["passed"] is not None else "-"
        cost = f"${r['cost_usd']:.2f}" if r["cost_usd"] is not None else "-"
        model_calls = "-" if r["model_calls"] is None else r["model_calls"]
        lines.append(
            f"| {r['run_id']} | {r['arm']} | {r['status']} | {score} | {passed} | "
            f"{cost} | {model_calls} | {r['seconds']:.0f} |"
        )
    paired = paired_lessons(rows)
    if lessons is not None:
        lines += [
            "",
            (
                f"The swarm-lessons arm recalled the frozen lesson corpus `{lessons['sha256']}` "
                f"({len(lessons['lesson_ids'])} lessons, frozen {lessons['frozen_at']}) at the "
                "start of each run. The swarm and baseline arms ran without it."
            ),
        ]
    if paired:
        lines += [
            "",
            "| Case | Swarm | Swarm + lessons | On minus off |",
            "| --- | --- | --- | --- |",
        ]
        lines += [
            f"| {p['case']} | {p['swarm']:.3f} | {p['swarm_lessons']:.3f} | "
            f"{p['delta_on_minus_off']:+.3f} |"
            for p in paired
        ]
    _write(args.out / "results.md", "\n".join(lines) + "\n")
    record = {"commit": commit, "complete": complete, "summary": summary, "runs": rows}
    if budget is not None:
        record["budget"] = budget
    if lessons is not None:
        record["lessons"] = lessons
    if paired:
        record["paired_lessons"] = paired
    _write(args.out / "results.json", json.dumps(record, indent=2))


def _write(path: Path, text: str) -> None:
    """Replace ``path`` whole, so a reader never sees half a report."""
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", type=Path, help="one case (named 'clean')")
    parser.add_argument(
        "--case",
        action="append",
        default=[],
        metavar="NAME=MANIFEST",
        help="a named case; repeat for a suite (overrides --manifest)",
    )
    parser.add_argument(
        "--with-tools", action="store_true", help="keep EXA/PAST keys (search, memory)"
    )
    parser.add_argument(
        "--max-parallel",
        type=int,
        default=8,
        help="runs at once; the baseline's client has no retries, so keep rate limits away",
    )
    parser.add_argument("--evaluator", type=Path, required=True)
    parser.add_argument("--grader-repo", type=Path, required=True)
    parser.add_argument("--grader-python", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--arms", nargs="+", default=["swarm", "baseline"], choices=ARMS)
    parser.add_argument("--baseline-model", default="gpt-5.5", choices=sorted(PRICES))
    parser.add_argument(
        "--lessons",
        type=Path,
        metavar="CORPUS",
        help="frozen lesson corpus for the swarm-lessons arm; every case must be held out",
    )
    parser.add_argument(
        "--runs-dir", type=Path, default=Path("runs"), help="where run folders go"
    )
    parser.add_argument(
        "--max-total-usd",
        type=float,
        help="spend cap for every run of the launch; each run reserves $2 before it starts",
    )
    parser.add_argument(
        "--budget-ledger",
        type=Path,
        help="file holding the cap's state, shared by invocations run one after another",
    )
    args = parser.parse_args()
    if args.lessons is not None:
        args.lessons = args.lessons.resolve()
    args.out = args.out.resolve()
    if args.out.is_relative_to(args.runs_dir.resolve()) or args.out.is_relative_to(
        Path.cwd()
    ):
        raise SystemExit(
            "--out must be evaluator storage outside the repo and the run folders"
        )
    args.out.mkdir(parents=True, exist_ok=True)
    logs = args.out / "logs"
    logs.mkdir(exist_ok=True)
    commit = git_commit()
    batch = args.out.name
    cases = dict(item.split("=", 1) for item in args.case)
    if not cases:
        if args.manifest is None:
            raise SystemExit("pass --manifest or one or more --case NAME=MANIFEST")
        cases = {"clean": str(args.manifest)}
    args.manifest = Path(next(iter(cases.values())))
    lessons = check_lessons(args, cases)
    budget = BudgetCap(args.max_total_usd, ledger=args.budget_ledger)
    jobs = [
        (arm, case, Path(manifest), f"{batch}-{case}-{arm}-{i}")
        for case, manifest in cases.items()
        for arm in args.arms
        for i in range(1, args.repeats + 1)
    ]
    print(f"starting {len(jobs)} runs at commit {commit[:10]}", flush=True)
    rows = run_all(jobs, args, logs, budget, commit, lessons)
    for arm, s in summarise(rows).items():
        print(
            f"{arm}: mean {_fmt(s['mean'])} ± {_fmt(s['sd'])} over {s['runs']} runs"
            f" ({s['not_run_budget']} not run: budget)",
            flush=True,
        )


def run_all(
    jobs: list[tuple[str, str, Path, str]],
    args: argparse.Namespace,
    logs: Path,
    budget: BudgetCap,
    commit: str,
    lessons: dict | None = None,
) -> list[dict]:
    """Run, grade and report every job; the report is rewritten as each run ends."""
    done: dict[int, dict] = {}
    lock = threading.Lock()

    def work(item: tuple[int, tuple[str, str, Path, str]]) -> None:
        index, job = item
        try:
            row = run_and_grade(job, args, logs, budget)
        except Exception as exc:  # noqa: BLE001 - keep the other runs and the report going
            arm, case, _, run_id = job
            row = {**skipped_run(arm, case, run_id), "status": "runner error"}
            row["error"] = repr(exc)[-300:]
        with lock:
            done[index] = row
            rows = [done[i] for i in sorted(done)]
            write_report(
                rows, summarise(rows), args, commit, lessons,
                budget=budget.snapshot(), complete=False,
            )

    with ThreadPoolExecutor(max_workers=max(1, min(len(jobs), args.max_parallel))) as pool:
        list(pool.map(work, enumerate(jobs)))
    rows = [done[i] for i in range(len(jobs))]
    write_report(rows, summarise(rows), args, commit, lessons, budget=budget.snapshot())
    return rows


if __name__ == "__main__":
    main()
