# Running Task 9 evaluations in the cloud

`eval/cloud.py` runs whole evaluation launches in Modal. Once launched, a launch needs nothing
from this machine: it keeps going if the laptop sleeps, closes or goes offline.

## What runs where

- **Orchestrator container** (one Modal function call per launch, up to 20 hours,
  non-preemptible): the repo at the launching commit with its locked dependencies, Edison's
  grader cloned at the pinned commit with its own venv, and the `crux-cloud` secret
  (`OPENAI_API_KEY`, Langfuse keys). It runs each job's `eval.run_task9_arms` and grades every
  run there.
- **Agent sandboxes**: unchanged. Each run's analysis code runs in a network-blocked Modal
  sandbox that mounts only its staged inputs from `crux-task9-inputs`.
- **`crux-evaluator` volume**: references, grading spec, suite truth, case manifests and
  lesson corpora. Mounted read-only, and only in the orchestrator container.
- **`crux-results` volume**: everything a launch writes, under `/<launch-id>/`. Committed every
  minute, so partial results survive.

```
/<launch-id>/launch.json          the launch as planned (jobs, commit, cap)
/<launch-id>/state.json           running/finished/failed, per-job state, function call id
/<launch-id>/budget.json          the spend cap: finished spend, in-flight reservations, skips
/<launch-id>/grader-self-test/    the grader scoring the references against themselves
/<launch-id>/runs/<run-id>/       run folders (events, artifacts, per-run LLM cache)
/<launch-id>/<launch-id>-<job>/   results.json, results.md, grades, logs, runner.log
```

## One-time setup

The `crux-cloud` secret must exist. Upload the evaluator files (again with `--force` after they
change):

```
uv run python -m eval.cloud upload \
  --references D:/hackathons/DU/evaluator/task9 \
  --truth D:/hackathons/DU/evaluator/task9-suite/evaluator/truth.json \
  --manifests D:/hackathons/DU/data/task9/suite-manifests/case-*.json \
              D:/hackathons/DU/data/task9/task9-clean-v38.json \
  [--lessons path/to/corpus.json]
```

## Launch

Commit first: the launcher refuses a dirty tree (`--allow-dirty` overrides it and records
`dirty: true`), because the recorded commit must be the code that runs.

One job from flags:

```
uv run python -m modal run --detach eval/cloud.py --name smoke --cases clean \
  --arms swarm --repeats 1 --max-total-usd 3
```

Several jobs, run in order under one cap, from a JSON file:

```json
[
  {"name": "main", "cases": "suite", "arms": ["swarm", "baseline", "swarm-random"], "repeats": 3,
   "score_faults": true},
  {"name": "lessons", "cases": ["case-02", "case-05"], "arms": ["swarm", "swarm-lessons"],
   "lessons": "corpus.json", "repeats": 3}
]
```

```
uv run python -m modal run --detach eval/cloud.py --jobs jobs.json --max-total-usd 120
```

Job keys: `name`, `cases` (`clean`, `suite`, or `case-01`..`case-13`), `arms` (`swarm`,
`swarm-lessons`, `swarm-random`, `baseline`), `repeats` (default 1), `lessons` (a corpus file
uploaded with `--lessons`; needed by `swarm-lessons`), `baseline_model` (default `gpt-5.5`),
`max_parallel` (default 8), `score_faults` (run the fault judge after the job; its few judge
calls are not counted against the cap). `--launch-id` names the launch (default
`t9-MMDD-HHMM`, UTC).

The command prints the launch id and returns. Before the first run, the cloud checks the key,
the manifests and the grader (self-test on the references); any failure stops the launch with
nothing spent.

## Status and results

```
uv run python -m eval.cloud status                 # every launch and its state
uv run python -m eval.cloud status --launch ID     # runs finished, scores, spend so far
uv run python -m eval.cloud fetch --launch ID --to D:/hackathons/DU/evaluator/results
```

`fetch` writes to `<to>/<launch-id>/` and refuses a folder inside the repo. `--no-runs` skips
the run folders; `--with-cache` adds the per-run LLM caches. Status reads what was last
committed (at most a minute old). Logs stream with `uv run python -m modal app logs crux-eval-cloud`;
`uv run python -m modal app stop crux-eval-cloud` stops a launch (sandboxes then end at their
idle timeout).

## Spend cap

`--max-total-usd` is required and covers every run of every job in the launch. Before a run
starts it reserves its $2 per-run cap; a run starts only while finished spend plus in-flight
reservations plus $2 stays within the cap. When a run ends, its reservation becomes its real
cost (or stays $2 if no cost was recorded). The first refusal stops the launch: that run and
every later run, in this job and the next ones, is listed in `results.json` with status
`not run: budget` and left out of the means. A $3 cap therefore allows exactly one run.

## Independent runs

Every run gets its own LLM disk cache, `runs/<run-id>/.cache/llm` (set through
`CRUX_LLM_CACHE_DIR`), so repeats of a case never replay each other's cached answers. Outside
the runner nothing changes: `LLMConfig` still defaults to `runs/.cache/llm`.

## If the container restarts

If Modal restarts the function call, or you relaunch from the same commit with the same
`--launch-id` and jobs, jobs marked done in `state.json` are skipped. A job cut off mid-way
would rerun whole, and its finished run ids already have folders and ledger entries, so they
would come back as runner errors: for a partial job, launch the remaining work under a new
launch id instead. Reservations left in flight by a dead process are charged in full.
