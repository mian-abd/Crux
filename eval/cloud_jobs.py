"""Plan cloud evaluation launches and describe their state, with no Modal calls.

``eval.cloud`` runs what this module plans. A launch is an ordered list of jobs under one
spend cap; each job is one ``eval.run_task9_arms`` invocation (cases, arms, repeats, an
optional lesson corpus) whose output folder and run folders live on the results volume.
"""

from __future__ import annotations

import re

EVALUATOR_MOUNT = "/evaluator"
RESULTS_MOUNT = "/results"
REMOTE_REPO = "/root/crux"
GRADER_REPO = "/opt/BixBench3"
GRADER_VENV = "/opt/grader-venv"
GRADER_PYTHON = f"{GRADER_VENV}/bin/python"

# Layout of the evaluator volume (mounted read-only, only in the orchestrator container).
REFERENCES = f"{EVALUATOR_MOUNT}/task9"
TRUTH = f"{EVALUATOR_MOUNT}/task9-suite/truth.json"
# Fresh held-out suites (make_cases seeds 44-47; seed 44 is batch-04, 45-47 batch-05). Each
# has its own case names (h<seed>-case-NN) and truth file, so the seed-43 suite's names,
# manifests and truth stay untouched.
HELDOUT_SEEDS = (44, 45, 46, 47)
HELDOUT_PREFIX = "h44-"
TRUTH_HELDOUT = f"{EVALUATOR_MOUNT}/task9-suite-h44/truth.json"
MANIFESTS = f"{EVALUATOR_MOUNT}/manifests"
_HELDOUT_CASE = re.compile(r"h(\d+)-case-\d{2}")
LESSONS = f"{EVALUATOR_MOUNT}/lessons"

SUITE = tuple(f"case-{i:02d}" for i in range(1, 14))
HELDOUT_SUITES = {seed: tuple(f"h{seed}-{case}" for case in SUITE) for seed in HELDOUT_SEEDS}
HELDOUT = HELDOUT_SUITES[44]
CASE_FILES = {
    "clean": "task9-clean-v38.json",
    **{case: f"{case}.json" for case in SUITE},
    **{case: f"{case}.json" for cases in HELDOUT_SUITES.values() for case in cases},
}
ARMS = ("swarm", "swarm-lessons", "swarm-random", "baseline")
BASELINE_MODELS = ("gpt-5.5", "gpt-4.1-mini")
_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,39}")
_JOB_KEYS = {
    "name", "cases", "arms", "repeats", "lessons", "baseline_model", "max_parallel",
    "score_faults",
}


def expand_cases(cases: str | list[str]) -> list[str]:
    """Case names from a list or comma string.

    ``suite`` stands for case-01 to case-13 (seed 43); ``suite-h44`` to ``suite-h47`` for
    h<seed>-case-01 to h<seed>-case-13 (the fresh held-out suites).
    """
    items = cases.split(",") if isinstance(cases, str) else list(cases)
    out: list[str] = []
    aliases = {f"suite-h{seed}": names for seed, names in HELDOUT_SUITES.items()}
    for item in (c.strip() for c in items):
        names = SUITE if item == "suite" else aliases.get(item, (item,) if item else ())
        for name in names:
            if name not in CASE_FILES:
                raise ValueError(
                    f"unknown case {name!r}; choose clean, suite, case-01..case-13, "
                    "suite-h44..suite-h47 or h<seed>-case-NN"
                )
            if name in out:
                raise ValueError(f"case {name} is listed twice")
            out.append(name)
    if not out:
        raise ValueError("a job needs at least one case")
    return out


def normalise_job(job: dict) -> dict:
    """A checked job with every default filled in."""
    unknown = set(job) - _JOB_KEYS
    if unknown:
        raise ValueError(f"unknown job keys: {', '.join(sorted(unknown))}")
    name = str(job.get("name", ""))
    if not _NAME.fullmatch(name):
        raise ValueError(f"job name {name!r} must be 1-40 letters, digits, - or _")
    arms = job.get("arms", ["swarm"])
    arms = arms.split(",") if isinstance(arms, str) else list(arms)
    if not arms or set(arms) - set(ARMS) or len(set(arms)) != len(arms):
        raise ValueError(f"job {name}: arms must be distinct, from {', '.join(ARMS)}")
    repeats = int(job.get("repeats", 1))
    max_parallel = int(job.get("max_parallel", 8))
    if not 1 <= repeats <= 20 or not 1 <= max_parallel <= 16:
        raise ValueError(f"job {name}: repeats must be 1-20 and max_parallel 1-16")
    lessons = job.get("lessons") or None
    if ("swarm-lessons" in arms) != (lessons is not None):
        raise ValueError(f"job {name}: the swarm-lessons arm and lessons go together")
    if lessons is not None and not re.fullmatch(r"[A-Za-z0-9_.-]+\.json", lessons):
        raise ValueError(f"job {name}: lessons is a corpus file name under {LESSONS}")
    model = job.get("baseline_model", "gpt-5.5")
    if model not in BASELINE_MODELS:
        raise ValueError(f"job {name}: baseline_model must be one of {BASELINE_MODELS}")
    cases = expand_cases(job.get("cases", []))
    suites = {suite_of(c) for c in cases}
    if job.get("score_faults") and len(suites) > 1:
        raise ValueError(f"job {name}: fault scoring needs cases from one suite")
    return {
        "name": name,
        "cases": cases,
        "arms": arms,
        "repeats": repeats,
        "lessons": lessons,
        "baseline_model": model,
        "max_parallel": max_parallel,
        "score_faults": bool(job.get("score_faults", False)),
    }


def plan_launch(
    jobs: list[dict],
    *,
    launch_id: str,
    commit: str,
    dirty: bool,
    max_total_usd: float,
    created_at: str,
) -> dict:
    """The launch spec the cloud function runs; it is also saved as ``launch.json``."""
    if not _NAME.fullmatch(launch_id):
        raise ValueError("the launch id must be 1-40 letters, digits, - or _")
    if not max_total_usd > 0:
        raise ValueError("--max-total-usd must be positive")
    planned = [normalise_job(job) for job in jobs]
    if not planned:
        raise ValueError("a launch needs at least one job")
    names = [job["name"] for job in planned]
    if len(set(names)) != len(names):
        raise ValueError("job names must be distinct")
    for job in planned:
        # The out folder name is the run-id prefix, so run ids are unique across launches.
        job["out"] = f"{launch_id}-{job['name']}"
        job["runs"] = len(job["cases"]) * len(job["arms"]) * job["repeats"]
    return {
        "launch_id": launch_id,
        "commit": commit,
        "dirty": dirty,
        "max_total_usd": float(max_total_usd),
        "created_at": created_at,
        "jobs": planned,
    }


def launch_root(launch: dict) -> str:
    return f"{RESULTS_MOUNT}/{launch['launch_id']}"


def job_command(job: dict, launch: dict, python: str = "python") -> list[str]:
    """The ``eval.run_task9_arms`` invocation of one job, with paths inside the container."""
    root = launch_root(launch)
    command = [python, "-m", "eval.run_task9_arms"]
    for case in job["cases"]:
        command += ["--case", f"{case}={MANIFESTS}/{CASE_FILES[case]}"]
    command += [
        "--arms", *job["arms"],
        "--repeats", str(job["repeats"]),
        "--evaluator", REFERENCES,
        "--grader-repo", GRADER_REPO,
        "--grader-python", GRADER_PYTHON,
        "--out", f"{root}/{job['out']}",
        "--runs-dir", f"{root}/runs",
        "--max-total-usd", str(launch["max_total_usd"]),
        "--budget-ledger", f"{root}/budget.json",
        "--max-parallel", str(job["max_parallel"]),
        "--baseline-model", job["baseline_model"],
    ]
    if job["lessons"]:
        command += ["--lessons", f"{LESSONS}/{job['lessons']}"]
    return command


def suite_of(case: str) -> str:
    """``h45`` for a held-out case, ``seed43`` for the original suite and the clean case."""
    m = _HELDOUT_CASE.fullmatch(case)
    return f"h{m.group(1)}" if m else "seed43"


def truth_for(job: dict) -> str:
    """The truth file for a job's suite (fault scoring takes cases from one suite)."""
    suites = {suite_of(c) for c in job["cases"]}
    if len(suites) == 1 and (suite := suites.pop()) != "seed43":
        return f"{EVALUATOR_MOUNT}/task9-suite-{suite}/truth.json"
    return TRUTH


def score_faults_command(job: dict, launch: dict, python: str = "python") -> list[str]:
    """The fault-detection scoring of one finished job (a judge model reads METHODS.md)."""
    root = launch_root(launch)
    out = f"{root}/{job['out']}"
    return [
        python, "-m", "eval.suites.task9.score_faults",
        "--truth", truth_for(job),
        "--results", f"{out}/results.json",
        "--runs", f"{root}/runs",
        "--out", out,
    ]


def status_lines(
    launch: dict,
    state: dict | None,
    budget: dict | None,
    results: dict[str, dict | None],
    call_state: str | None = None,
) -> list[str]:
    """A plain-text summary of a launch: per job and run, what finished and what it cost."""
    state = state or {}
    lines = [
        f"launch {launch['launch_id']} at commit {launch['commit'][:12]}"
        + (" (dirty tree)" if launch.get("dirty") else "")
        + f", created {launch['created_at']}",
        f"state: {state.get('state', 'not started')}"
        + (f"; function call: {call_state}" if call_state else ""),
    ]
    if budget:
        lines.append(
            f"spend: ${budget['spent_usd']:.2f} finished + ${budget['reserved_usd']:.2f} "
            f"reserved of ${budget['max_total_usd']:.2f} cap; "
            f"{len(budget['finished'])} runs settled, {len(budget['in_flight'])} in flight, "
            f"{len(budget['skipped'])} not run (budget)"
        )
    else:
        lines.append(f"spend: nothing yet (cap ${launch['max_total_usd']:.2f})")
    jobs_state = state.get("jobs", {})
    for job in launch["jobs"]:
        result = results.get(job["name"])
        job_state = jobs_state.get(job["name"], {}).get("state", "pending")
        rows = (result or {}).get("runs", [])
        complete = (result or {}).get("complete", False)
        lines.append(
            f"job {job['name']} [{job_state}]: {len(rows)}/{job['runs']} runs recorded"
            + (" (results complete)" if complete else "")
        )
        for row in rows:
            score = "-" if row.get("mean") is None else f"{row['mean']:.3f}"
            cost = "-" if row.get("cost_usd") is None else f"${row['cost_usd']:.2f}"
            lines.append(f"  {row['run_id']}: {row.get('status')}, score {score}, cost {cost}")
    return lines
