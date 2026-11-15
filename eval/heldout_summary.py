"""Summarise held-out Task 9 suites, per suite and combined (batch-04 and batch-05).

Reads each batch folder's ``suite_results.json`` (from ``eval.run_task9_arms``) and
``suite_fault_detection.json`` (from ``eval.suites.task9.score_faults``) and prints, per
suite and over all suites together: mean scores per arm over all cases and over the fault
cases, the paired swarm-minus-baseline difference with a 95% bootstrap interval over cases
(10,000 resamples, seed 0, as in the batch-03 and batch-04 reports), faults caught, noticed
and missed, mean cost and runs that failed. A run that failed or was not graded scores 0.

    uv run python -m eval.heldout_summary eval/results/task9_batch04 eval/results/task9_batch05_h45 ...
"""

from __future__ import annotations

import argparse
import json
import random
import re
from collections import defaultdict
from pathlib import Path

import numpy as np

ARMS = ("swarm", "baseline")
RESAMPLES = 10_000
SEED = 0
# Statuses of a run that crashed (as in eval/make_charts.py). A run stopped by its spend cap
# ("spend_limit") still produced outputs and is graded like a finished one.
CRASHED = ("error", "run.error")
_CASE = re.compile(r"(h\d+)-case-\d{2}")


def run_score(run: dict) -> float:
    """A run's grade, or 0 if it crashed or was not graded."""
    if run.get("status") in CRASHED or run.get("mean") is None:
        return 0.0
    return float(run["mean"])


def bootstrap_mean_ci(values: np.ndarray, resamples: int = RESAMPLES, seed: int = SEED) -> tuple[float, float]:
    """95% percentile interval of the mean, resampling the values with replacement.

    ``random.Random(seed)`` with one ``randrange`` per draw, the procedure behind the batch-03
    and batch-04 intervals (it reproduces batch-04's +0.048 to +0.382 exactly).
    """
    rng = random.Random(seed)
    n = len(values)
    means = [sum(values[rng.randrange(n)] for _ in range(n)) / n for _ in range(resamples)]
    lo, hi = np.percentile(means, [2.5, 97.5])
    return float(lo), float(hi)


def load(folder: Path) -> tuple[list[dict], list[dict]]:
    results = json.loads((folder / "suite_results.json").read_text(encoding="utf-8"))
    faults_path = folder / "suite_fault_detection.json"
    faults = json.loads(faults_path.read_text(encoding="utf-8")) if faults_path.exists() else []
    return results["runs"], faults


def suite_of(case: str) -> str:
    m = _CASE.fullmatch(case)
    return m.group(1) if m else "seed43"


def summarise(runs: list[dict], faults: list[dict]) -> dict:
    """The measures for one set of runs (one suite, or several together)."""
    scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    cost: dict[str, list[float]] = defaultdict(list)
    failed: dict[str, int] = defaultdict(int)
    for run in runs:
        arm = run["arm"]
        scores[run["case"]][arm].append(run_score(run))
        if run.get("cost_usd") is not None:
            cost[arm].append(float(run["cost_usd"]))
        if run.get("status") in CRASHED or run.get("mean") is None:
            failed[arm] += 1
    clean = {f["case"] for f in faults}
    cases = sorted(c for c in scores if all(scores[c][a] for a in ARMS))
    per_case = {c: {a: float(np.mean(scores[c][a])) for a in ARMS} for c in cases}
    diffs = np.array([per_case[c]["swarm"] - per_case[c]["baseline"] for c in cases])
    fault_cases = [c for c in cases if c in clean] if clean else []
    verdicts: dict[str, dict[str, int]] = {a: defaultdict(int) for a in ARMS}
    for f in faults:
        if f["arm"] in verdicts:
            verdicts[f["arm"]][f["verdict"]] += 1
    out = {
        "cases": len(cases),
        "mean": {a: float(np.mean([per_case[c][a] for c in cases])) for a in ARMS},
        "sd": {a: float(np.std([per_case[c][a] for c in cases], ddof=1)) for a in ARMS},
        "paired_diff": float(diffs.mean()),
        "paired_ci": bootstrap_mean_ci(diffs),
        "higher_lower_tied": (int((diffs > 0.005).sum()), int((diffs < -0.005).sum()),
                              int((abs(diffs) <= 0.005).sum())),
        "mean_cost": {a: float(np.mean(cost[a])) if cost[a] else None for a in ARMS},
        "failed_runs": {a: failed[a] for a in ARMS},
        "faults": {a: dict(verdicts[a]) for a in ARMS},
    }
    if fault_cases:
        out["fault_cases"] = len(fault_cases)
        out["fault_mean"] = {a: float(np.mean([per_case[c][a] for c in fault_cases])) for a in ARMS}
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folders", nargs="+", type=Path)
    parser.add_argument("--json", type=Path, help="also write the summary here")
    args = parser.parse_args(argv)
    all_runs: list[dict] = []
    all_faults: list[dict] = []
    by_suite: dict[str, tuple[list[dict], list[dict]]] = defaultdict(lambda: ([], []))
    for folder in args.folders:
        runs, faults = load(folder)
        all_runs += runs
        all_faults += faults
        for run in runs:
            by_suite[suite_of(run["case"])][0].append(run)
        for f in faults:
            by_suite[suite_of(f["case"])][1].append(f)
    report = {suite: summarise(*by_suite[suite]) for suite in sorted(by_suite)}
    if len(by_suite) > 1:
        report["combined"] = summarise(all_runs, all_faults)
    for name, s in report.items():
        lo, hi = s["paired_ci"]
        line = (f"{name}: {s['cases']} cases; swarm {s['mean']['swarm']:.3f} ± {s['sd']['swarm']:.3f}, "
                f"single agent {s['mean']['baseline']:.3f} ± {s['sd']['baseline']:.3f}; "
                f"paired {s['paired_diff']:+.3f} ({lo:+.3f} to {hi:+.3f}); "
                f"higher/lower/tied {'/'.join(map(str, s['higher_lower_tied']))}")
        if "fault_mean" in s:
            line += (f"; {s['fault_cases']} fault cases {s['fault_mean']['swarm']:.3f} vs "
                     f"{s['fault_mean']['baseline']:.3f}")
        line += f"; faults swarm {s['faults']['swarm']} vs single agent {s['faults']['baseline']}"
        line += f"; failed runs {s['failed_runs']}; mean cost {s['mean_cost']}"
        print(line)
    if args.json:
        args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
