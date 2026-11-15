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
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

PRICES = {"gpt-5.5": ("5.00", "30.00"), "gpt-4.1-mini": ("0.40", "1.60")}


def git_commit() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()


# Tool keys stripped from every run unless --with-tools: both arms then get the same tools
# (no web search, no shared memory), and search or memory become separate, labelled runs.
TOOL_KEYS = ("EXA_API_KEY", "PAST_API_KEY")


def run_arm(
    arm: str,
    case: str,
    manifest: Path,
    run_id: str,
    args: argparse.Namespace,
    logs: Path,
) -> dict:
    if arm == "swarm":
        command = [
            sys.executable,
            "-m",
            "core.cli",
            "--lab",
            "bixbench3",
            "--manifest",
            str(manifest),
            "--runs-dir",
            "runs",
            "--run-id",
            run_id,
        ]
    else:
        rate_in, rate_out = PRICES[args.baseline_model]
        command = [
            sys.executable,
            "-m",
            "eval.baseline_agent",
            "--manifest",
            str(manifest),
            "--run-id",
            run_id,
            "--model",
            args.baseline_model,
            "--input-rate",
            rate_in,
            "--output-rate",
            rate_out,
        ]
    started = datetime.now()
    with (logs / f"{run_id}.log").open("w", encoding="utf-8") as log:
        env = dict(os.environ)
        if not args.with_tools:
            for key in TOOL_KEYS:
                env.pop(key, None)
        done = subprocess.run(
            command, stdout=log, stderr=subprocess.STDOUT, check=False, env=env
        )
    return {
        "arm": arm,
        "case": case,
        "run_id": run_id,
        "exit_code": done.returncode,
        "seconds": (datetime.now() - started).total_seconds(),
        **run_cost(arm, run_id),
    }


def run_cost(arm: str, run_id: str) -> dict:
    folder = Path("runs") / run_id
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
    artifacts = Path("runs") / run["run_id"] / "artifacts"
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


def summarise(rows: list[dict]) -> dict:
    out = {}
    for arm in sorted({r["arm"] for r in rows}):
        scores = [
            r["mean"] if r["mean"] is not None else 0.0 for r in rows if r["arm"] == arm
        ]
        costs = [
            r["cost_usd"] for r in rows if r["arm"] == arm and r["cost_usd"] is not None
        ]
        out[arm] = {
            "runs": len(scores),
            "mean": statistics.mean(scores),
            "sd": statistics.stdev(scores) if len(scores) > 1 else 0.0,
            "min": min(scores),
            "max": max(scores),
            "mean_cost_usd": statistics.mean(costs) if costs else None,
        }
    return out


def write_report(
    rows: list[dict], summary: dict, args: argparse.Namespace, commit: str
) -> None:
    lines = [
        f"# Task 9: swarm vs single-agent baseline ({args.out.name})",
        "",
        (
            f"Code at commit `{commit}`. Inputs: `{args.manifest.name}`. "
            f"Baseline model: `{args.baseline_model}`. "
            "Failed or ungraded runs count as 0 in the means."
        ),
        "",
        "| Arm | Runs | Mean score | SD | Min | Max | Mean cost |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for arm, s in summary.items():
        cost = f"${s['mean_cost_usd']:.2f}" if s["mean_cost_usd"] is not None else "n/a"
        lines.append(
            f"| {arm} | {s['runs']} | {s['mean']:.3f} | {s['sd']:.3f} | {s['min']:.3f} | {s['max']:.3f} | {cost} |"
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
        lines.append(
            f"| {r['run_id']} | {r['arm']} | {r['status']} | {score} | {passed} | "
            f"{cost} | {r['model_calls']} | {r['seconds']:.0f} |"
        )
    (args.out / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (args.out / "results.json").write_text(
        json.dumps({"commit": commit, "summary": summary, "runs": rows}, indent=2),
        encoding="utf-8",
    )


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
    parser.add_argument("--arms", nargs="+", default=["swarm", "baseline"])
    parser.add_argument("--baseline-model", default="gpt-5.5", choices=sorted(PRICES))
    args = parser.parse_args()
    args.out = args.out.resolve()
    if args.out.is_relative_to(Path("runs").resolve()) or args.out.is_relative_to(
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
    jobs = [
        (arm, case, Path(manifest), f"{batch}-{case}-{arm}-{i}")
        for case, manifest in cases.items()
        for arm in args.arms
        for i in range(1, args.repeats + 1)
    ]
    print(f"starting {len(jobs)} runs at commit {commit[:10]}", flush=True)
    with ThreadPoolExecutor(max_workers=min(len(jobs), args.max_parallel)) as pool:
        runs = list(pool.map(lambda job: run_arm(*job, args, logs), jobs))
    for r in runs:
        print(
            f"finished {r['run_id']}: exit {r['exit_code']}, {r['status']}, {r['seconds']:.0f}s",
            flush=True,
        )
    rows = [grade(r, args) for r in runs]
    summary = summarise(rows)
    write_report(rows, summary, args, commit)
    for arm, s in summary.items():
        print(
            f"{arm}: mean {s['mean']:.3f} ± {s['sd']:.3f} over {s['runs']} runs",
            flush=True,
        )


if __name__ == "__main__":
    main()
