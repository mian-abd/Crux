"""Run Task 9 evaluation launches in Modal's cloud, detached from this machine.

Launch (returns at once; the launch keeps running if this machine sleeps or goes offline):

    uv run python -m modal run --detach eval/cloud.py --jobs jobs.json --max-total-usd 60
    uv run python -m modal run --detach eval/cloud.py --cases clean --arms swarm \
        --repeats 1 --name smoke --max-total-usd 3

Watch and collect (plain Python, no app run):

    uv run python -m eval.cloud status [--launch ID]
    uv run python -m eval.cloud fetch --launch ID --to D:/hackathons/DU/evaluator/results
    uv run python -m eval.cloud upload --references ... --truth ... --manifests ...

One function call runs the launch's jobs in order. Each job is an ``eval.run_task9_arms``
invocation inside the orchestrator container; its runs still execute their analysis code in
the usual network-blocked Modal sandboxes (``execution.sandbox``, which mount only the
staged inputs). The orchestrator container alone mounts the evaluator volume (references,
suite truth, case manifests, lesson corpora), read-only, and writes run folders, grades and
reports to the results volume, committing it every minute so partial results survive. The
launch's spend cap is shared by every job through ``<launch>/budget.json``.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path

import modal

REPO = Path(__file__).resolve().parents[1]
if (REPO / "eval" / "cloud_jobs.py").is_file() and str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from eval.cloud_jobs import (
    CASE_FILES,
    EVALUATOR_MOUNT,
    GRADER_PYTHON,
    GRADER_REPO,
    GRADER_VENV,
    MANIFESTS,
    REFERENCES,
    REMOTE_REPO,
    RESULTS_MOUNT,
    job_command,
    launch_root,
    plan_launch,
    score_faults_command,
    status_lines,
)
from labs.bixbench3.task9_contract import GRADER_COMMIT

APP_NAME = "crux-eval-cloud"
SECRET_NAME = "crux-cloud"
EVALUATOR_VOLUME = "crux-evaluator"
RESULTS_VOLUME = "crux-results"
TIMEOUT_S = 20 * 3600
COMMIT_EVERY_S = 60
GRADER_URL = "https://github.com/EdisonScientific/BixBench3.git"
# ``pip freeze`` of the local grader env; the wrapper only imports the deterministic grader.
GRADER_REQUIREMENTS = (
    "annotated-types==0.8.0",
    "numpy==2.4.4",
    "pandas==3.0.3",
    "pydantic==2.13.4",
    "pydantic-core==2.46.4",
    "python-dateutil==4.0.0",
    "scipy==1.17.1",
    "typing-extensions==4.16.0",
    "typing-inspection==0.4.5",
    "tzdata==2026.6",
)
# Never ship local envs, run folders, git data, tool config or anything secret-shaped. Every
# hidden file and folder is left out: .venv, .git, .env files, caches and editor/tool folders.
IGNORE = [
    ".*", "**/.*", "**/node_modules", "web", "runs", "**/__pycache__", "**/*.pem",
    "**/*.key", "secrets", "**/*ground-truth*", "**/*ground_truth*", "**/*truth-table*",
    "**/*truth_table*", "**/truth.json",
]

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git")
    .run_commands(
        f"git clone --quiet {GRADER_URL} {GRADER_REPO}",
        f"git -C {GRADER_REPO} checkout --quiet --detach {GRADER_COMMIT}",
        f"python -m venv {GRADER_VENV}",
        f"{GRADER_PYTHON} -m pip install --quiet --no-cache-dir "
        + " ".join(GRADER_REQUIREMENTS),
        f'test -z "$(git -C {GRADER_REPO} status --porcelain -- src)"',
    )
    .uv_sync(str(REPO))
    .env({"PYTHONPATH": REMOTE_REPO, "PYTHONUNBUFFERED": "1"})
    .workdir(REMOTE_REPO)
    .add_local_dir(REPO, REMOTE_REPO, ignore=IGNORE)
)

app = modal.App(APP_NAME, image=image)
evaluator_volume = modal.Volume.from_name(EVALUATOR_VOLUME)
results_volume = modal.Volume.from_name(RESULTS_VOLUME, create_if_missing=True)
_commit_lock = threading.Lock()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _commit() -> None:
    with _commit_lock:
        try:
            results_volume.commit()
        except Exception as exc:  # noqa: BLE001 - a failed commit is retried next tick
            print(f"results volume commit failed: {type(exc).__name__}: {exc}", flush=True)


def _commit_until(stop: threading.Event) -> None:
    while not stop.wait(COMMIT_EVERY_S):
        _commit()


def _stream(command: list[str], log_path: Path, env: dict[str, str]) -> int:
    """Run ``command`` in the repo, copying its output to the app log and ``log_path``."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"$ {' '.join(command)}\n")
        process = subprocess.Popen(
            command,
            cwd=REMOTE_REPO,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert process.stdout is not None
        for line in process.stdout:
            print(line, end="", flush=True)
            log.write(line)
            log.flush()
        return process.wait()


def _preflight(launch: dict, root: Path) -> None:
    """Check keys, inputs and the grader in the cloud before any money is spent."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(f"OPENAI_API_KEY is missing from the {SECRET_NAME} secret")
    if not (Path(REFERENCES) / "artifacts_grading.json").is_file():
        raise RuntimeError(f"no grading spec under {REFERENCES} on the evaluator volume")
    for job in launch["jobs"]:
        for case in job["cases"]:
            manifest = Path(MANIFESTS) / CASE_FILES[case]
            if not manifest.is_file():
                raise RuntimeError(f"no manifest for {case} at {manifest}")
        if job["lessons"] and not (Path(EVALUATOR_MOUNT) / "lessons" / job["lessons"]).is_file():
            raise RuntimeError(f"no lesson corpus {job['lessons']} on the evaluator volume")
    # The reference outputs graded against themselves must score 1: grader, venv and
    # references all work here before the first run starts.
    code = _stream(
        [
            sys.executable, "-m", "eval.grade_bixbench3", "--task", "9", "--self-test",
            "--artifacts-dir", "/tmp/grader-self-test/artifacts",
            "--references", REFERENCES,
            "--output-dir", str(root / "grader-self-test"),
            "--grader-repo", GRADER_REPO,
            "--python", GRADER_PYTHON,
        ],
        root / "grader-self-test.log",
        dict(os.environ),
    )
    if code != 0:
        raise RuntimeError("the grader self-test failed in the cloud; see grader-self-test.log")


@app.function(
    secrets=[modal.Secret.from_name(SECRET_NAME)],
    volumes={EVALUATOR_MOUNT: evaluator_volume.read_only(), RESULTS_MOUNT: results_volume},
    timeout=TIMEOUT_S,
    # Up to 8 runs at once, each mostly waiting on the model; non-preemptible capacity is
    # billed at 3x, so keep the container small.
    cpu=2.0,
    memory=8192,
    nonpreemptible=True,
)
def run_launch(launch: dict) -> dict:
    root = Path(launch_root(launch))
    state_path = root / "state.json"
    spec_path = root / "launch.json"
    if spec_path.is_file():
        saved = json.loads(spec_path.read_text(encoding="utf-8"))
        if {**saved, "created_at": None} != {**launch, "created_at": None}:
            raise RuntimeError(f"launch id {launch['launch_id']} is already used by another launch")
        print("resuming: jobs already done are skipped", flush=True)
    else:
        _write_json(spec_path, launch)
    state = (
        json.loads(state_path.read_text(encoding="utf-8"))
        if state_path.is_file()
        else {"jobs": {}}
    )
    state.update(
        state="running",
        started_at=_now(),
        function_call_id=modal.current_function_call_id(),
    )
    _write_json(state_path, state)
    _commit()
    env = {
        **os.environ,
        "CRUX_GIT_COMMIT": launch["commit"],
        "CRUX_LAUNCH_ID": launch["launch_id"],
    }
    stop = threading.Event()
    committer = threading.Thread(target=_commit_until, args=(stop,), daemon=True)
    committer.start()
    try:
        _preflight(launch, root)
        for job in launch["jobs"]:
            job_state = state["jobs"].setdefault(job["name"], {})
            if job_state.get("state") == "done":
                continue
            job_state.update(state="running", started_at=_now())
            _write_json(state_path, state)
            _commit()
            out = root / job["out"]
            code = _stream(job_command(job, launch, sys.executable), out / "runner.log", env)
            if code == 0 and job["score_faults"]:
                code = _stream(
                    score_faults_command(job, launch, sys.executable), out / "runner.log", env
                )
            job_state.update(
                state="done" if code == 0 else "failed", exit_code=code, finished_at=_now()
            )
            _write_json(state_path, state)
            _commit()
        state.update(state="finished", finished_at=_now())
    except BaseException as exc:
        state.update(state="failed", error=f"{type(exc).__name__}: {exc}"[:500], finished_at=_now())
        raise
    finally:
        stop.set()
        _write_json(state_path, state)
        _commit()
    return state


def _local_commit() -> tuple[str, bool]:
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    dirty = bool(
        subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True).strip()
    )
    return commit, dirty


@app.local_entrypoint()
def launch(
    jobs: str = "",
    cases: str = "",
    arms: str = "swarm",
    repeats: int = 1,
    name: str = "batch",
    lessons: str = "",
    baseline_model: str = "gpt-5.5",
    max_parallel: int = 8,
    score_faults: bool = False,
    max_total_usd: float = 0.0,
    launch_id: str = "",
    allow_dirty: bool = False,
) -> None:
    """Plan a launch from --jobs FILE (a JSON list of jobs) or one job's flags, then spawn it."""
    if jobs:
        job_list = json.loads(Path(jobs).read_text(encoding="utf-8"))
    else:
        job_list = [
            {
                "name": name,
                "cases": cases,
                "arms": arms,
                "repeats": repeats,
                "lessons": lessons or None,
                "baseline_model": baseline_model,
                "max_parallel": max_parallel,
                "score_faults": score_faults,
            }
        ]
    commit, dirty = _local_commit()
    if dirty and not allow_dirty:
        raise SystemExit(
            "the working tree has uncommitted changes, so the recorded commit would not be the "
            "code that runs; commit them or pass --allow-dirty"
        )
    stamp = datetime.now(UTC)
    spec = plan_launch(
        job_list,
        launch_id=launch_id or stamp.strftime("t9-%m%d-%H%M"),
        commit=commit,
        dirty=dirty,
        max_total_usd=max_total_usd,
        created_at=stamp.isoformat(timespec="seconds"),
    )
    call = run_launch.spawn(spec)
    total = sum(job["runs"] for job in spec["jobs"])
    print(f"launched {spec['launch_id']}: {total} runs in {len(spec['jobs'])} jobs, "
          f"cap ${spec['max_total_usd']:.2f}, commit {commit[:12]}")
    print(f"function call: {call.object_id}")
    print(f"status: uv run python -m eval.cloud status --launch {spec['launch_id']}")
    print(f"fetch:  uv run python -m eval.cloud fetch --launch {spec['launch_id']} --to DIR")


# --- status, fetch and upload, run from this machine as ``python -m eval.cloud ...`` -------


def _read_json(volume: modal.Volume, path: str) -> dict | None:
    try:
        return json.loads(b"".join(volume.read_file(path)))
    except (FileNotFoundError, modal.exception.NotFoundError):
        return None


def _call_state(call_id: str | None) -> str | None:
    if not call_id:
        return None
    try:
        modal.FunctionCall.from_id(call_id).get(timeout=0)
    except TimeoutError:
        return "running"
    except Exception as exc:  # noqa: BLE001 - any failure means the call ended
        return f"ended with {type(exc).__name__}"
    return "finished"


def status(launch_id: str | None) -> None:
    volume = modal.Volume.from_name(RESULTS_VOLUME)
    if not launch_id:
        for entry in sorted(volume.listdir("/"), key=lambda e: e.path):
            state = _read_json(volume, f"/{entry.path}/state.json") or {}
            print(f"{entry.path}: {state.get('state', 'not started')}")
        return
    launch = _read_json(volume, f"/{launch_id}/launch.json")
    if launch is None:
        raise SystemExit(f"no launch {launch_id} on the {RESULTS_VOLUME} volume (yet)")
    state = _read_json(volume, f"/{launch_id}/state.json")
    budget = _read_json(volume, f"/{launch_id}/budget.json")
    results = {
        job["name"]: _read_json(volume, f"/{launch_id}/{job['out']}/results.json")
        for job in launch["jobs"]
    }
    call = _call_state((state or {}).get("function_call_id"))
    print("\n".join(status_lines(launch, state, budget, results, call)))


def fetch(launch_id: str, to: Path, *, runs: bool, cache: bool) -> None:
    target = to.resolve() / launch_id
    if target.is_relative_to(REPO):
        raise SystemExit("fetch results to evaluator storage outside the repo")
    volume = modal.Volume.from_name(RESULTS_VOLUME)
    count = 0
    for entry in volume.listdir(f"/{launch_id}", recursive=True):
        if entry.type != modal.volume.FileEntryType.FILE:
            continue
        relative = entry.path.removeprefix(f"{launch_id}/").lstrip("/")
        parts = relative.split("/")
        if (not runs and parts[0] == "runs") or (not cache and ".cache" in parts):
            continue
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as file:
            volume.read_file_into_fileobj(entry.path, file)
        count += 1
    print(f"fetched {count} files to {target}")


def upload(
    references: Path,
    truth: Path,
    manifests: list[Path],
    lessons: list[Path],
    *,
    force: bool,
    truth_dest: str = "/task9-suite/truth.json",
) -> None:
    if not (references / "artifacts_grading.json").is_file():
        raise SystemExit(f"{references} has no artifacts_grading.json")
    for path in [truth, *manifests, *lessons]:
        if not path.is_file():
            raise SystemExit(f"missing {path}")
    volume = modal.Volume.from_name(EVALUATOR_VOLUME, create_if_missing=True)
    with volume.batch_upload(force=force) as batch:
        batch.put_directory(str(references), "/task9")
        batch.put_file(str(truth), truth_dest)
        for manifest in manifests:
            batch.put_file(str(manifest), f"/manifests/{manifest.name}")
        for corpus in lessons:
            batch.put_file(str(corpus), f"/lessons/{corpus.name}")
    print(
        f"uploaded references, truth, {len(manifests)} manifests and {len(lessons)} lesson "
        f"corpora to the {EVALUATOR_VOLUME} volume"
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m eval.cloud", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    show = commands.add_parser("status", help="list launches, or one launch's runs and spend")
    show.add_argument("--launch")
    get = commands.add_parser("fetch", help="download a launch's results")
    get.add_argument("--launch", required=True)
    get.add_argument("--to", type=Path, required=True, help="a folder outside the repo")
    get.add_argument("--no-runs", action="store_true", help="skip the run folders")
    get.add_argument("--with-cache", action="store_true", help="include per-run LLM caches")
    put = commands.add_parser("upload", help="put evaluator files on the evaluator volume")
    put.add_argument("--references", type=Path, required=True)
    put.add_argument("--truth", type=Path, required=True)
    put.add_argument("--truth-dest", default="/task9-suite/truth.json",
                     help="where the truth file goes on the evaluator volume "
                          "(/task9-suite-h<seed>/truth.json for a held-out suite)")
    put.add_argument("--manifests", type=Path, nargs="+", required=True)
    put.add_argument("--lessons", type=Path, nargs="*", default=[])
    put.add_argument("--force", action="store_true", help="overwrite files already there")
    args = parser.parse_args(argv)
    if args.command == "status":
        status(args.launch)
    elif args.command == "fetch":
        fetch(args.launch, args.to, runs=not args.no_runs, cache=args.with_cache)
    else:
        upload(args.references, args.truth, args.manifests, args.lessons, force=args.force,
               truth_dest=args.truth_dest)


if __name__ == "__main__":
    main()
