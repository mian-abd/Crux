# Crux

Crux agents propose competing scientific explanations, select diagnostics by expected information gain and cost, and update their beliefs from observations. The shared engine targets BixBench3 Task 9, BoxingGym Location Finding, and the Jetson bench. See the [engineering requirements](docs/ERD.md) for the lab contracts and repository layout.

## Getting started

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and run these commands from the repository root. The first sync installs Python 3.12 if needed and resolves the environment from the lockfile. The tests run locally without API credentials.

```sh
uv sync
uv run pytest -q
uv run ruff check .
```

For live integrations, set the environment variables listed in `.env.example`. To load values from a local `.env` file, use `uv run --env-file .env` before your command. Run settings and ablation options are defined in `core/config.py`.

## Offline demo

Run `uv run python -m scripts.make_demo_fixture` to regenerate the UI replays.
`web/fixtures/demo.jsonl` records a successful synthetic run, including an invalid diagnostic
and a critic review. `web/fixtures/demo-error.jsonl` records a failed run. Each file has one
terminal event. Together they exercise the full [event contract](docs/EVENTS.md).

## Claims lab (MVP)

`uv run python -m core.cli --lab claims --run-id claims-demo` audits four hand-curated
mathematical and statistical claims from the DESeq2 paper (Love, Huber & Anders 2014) with the
same engine, using SymPy derivations and simulations run on this machine; no API key is needed.
It is an MVP on four curated claims, not claim extraction from arbitrary papers. See
[docs/CLAIMS.md](docs/CLAIMS.md); the recorded run is `runs/demo/claims_deseq2.jsonl`.

## Leakage controls

Agent-visible inputs exclude benchmark ground truth and planted-fault truth tables. The ERD reserves grading for a separate process in `eval/`. Ordinary run logs and artifacts are ignored by Git. Review files in `runs/demo/` before staging them.

Memory follows the same rule. Every upload names a fixed run/config/repeat audience, including corrections. Readers are selected by server-side context, never by query text. Run-ID prefixes and metadata are not recall filters. Do not put task evidence into project-visible memory. A project key can access every audience in its project; use separate projects for stronger isolation. The tests check audience membership, negative cross-run recall and foreign-source rejection. Grader outputs and ground truth stay outside agent-visible stores, and no grader is imported by the memory implementation.

## Memory

`memory/` holds the shared evidence memory behind `core.interfaces.Memory`: a past.dev adapter (DU-16), a role-only local baseline and a frozen-history decision replay (DU-17), and reviewed development-only lessons (DU-30). See [docs/MEMORY_COMPARISON.md](docs/MEMORY_COMPARISON.md) for the backend switch, the common instrumentation and the comparison command, and [docs/LESSONS.md](docs/LESSONS.md) for the lesson review contract. The local arm works without API keys.

A live synthetic integration check (uses a little past.dev credit, needs `PAST_API_KEY`) is available with:

```sh
uv run --env-file .env python -m memory.demo
```

It exercises experimenter observation → critic recall and objection → designer recall and changed action, then checks that a second run cannot recall a private sentinel. This is a synthetic plumbing check, not a scientific result or a measured memory gain.

```python
from pathlib import Path
from core.schemas import Evidence
from memory.base import RunContext
from memory.pastdev import PastMemory

# Inside an async function:
async with PastMemory(RunContext(run_id="r1", task_id="task9"), Path("runs")) as memory:
    await memory.write(
        Evidence(id="obs1", kind="observation", claim="Two samples share a subject",
                 author_role="experimenter"),
        run_id="r1", author_role="experimenter",
    )
    await memory.flush()  # optional barrier: wait for indexing, e.g. before a benchmark
    evidence = await memory.recall("Which samples share subjects?", "r1", "critic")
```

`write()` commits locally without making a network call. Background upload retries transient errors; closing the adapter preserves unfinished work for a later restart. `flush()` has a bounded timeout and surfaces failures. It resumes polling the saved ingestion ID, which is distinct from the evidence/source ID. Rejected content requires a corrected new event rather than automatic retries of the same body.

Use `write_record(MemoryRecord(...))` for the full provenance envelope, including conditions, parent events, artifact references, review status and `supersedes` evidence IDs. IDs are immutable: retries preserve the exact body and idempotency key; corrections get a new ID. Objections, invalid analyses and corrections are mandatory context until superseded. They can exceed recall's `k` so a veto is never silently dropped. Callers must budget this mandatory context in their prompts.

A failed remote recall is recorded separately from an empty successful response. Pending and mandatory local records provide an explicitly logged fallback; otherwise the adapter raises `RecallUnavailable`. Completed ordinary history is selected only by remote recall. Returned source IDs must resolve to current canonical local records. Retrieval preserves evidence IDs and never emits a new observation or updates a posterior: the orchestrator deduplicates evidence IDs before applying Bayesian updates.

`RunContext` binds run, task, config and repeat to a deterministic audience and role-specific reader identities. Reopen the same context/root to resume its outbox. Roles must be declared in `RunContext.roles` before use; the defaults cover the ERD's scientific roles.

## Which memory holds what

| Store | Contents and authority |
| --- | --- |
| `runs/<run_id>/events.jsonl` | The run event log: observations, belief updates and every `memory.written` / `memory.recalled` event. Authority for orchestration state and belief replay. |
| `runs/<scope>/memory.sqlite3` | Durable structured memory journal, canonical record status, outbox receipts and retries, exact retrieval requests/responses, selected evidence IDs and latency. Authority for the adapter's evidence; it does not replace the event log. |
| past.dev | Compact evidence envelopes and artifact pointers; supplies scoped relevant context, not scientific truth. |
| Modal/artifact storage | Matrices, raw data, generated code, artifacts and environment manifests; large files stay out of memory. |

The role-only configuration (`memory="local_role_only"`) provides the comparison for measuring the effect of sharing evidence.

### Memory in a Task 9 run

`build_task9_run` builds the run's memory from `cfg.memory` (`memory.run.memory_from_config`): past.dev when `PAST_API_KEY` is set, the role-only local ledger for `local_role_only` (no key needed), and no memory otherwise, with a warning and no network calls. The memory binds to the run id on its first call, so each run gets its own past.dev audience and journal (`runs/<run_id>/memory/`). It closes with the lab. A failed write or recall is logged and audited but never stops the run; a failed recall gives no extra context.

| Who | Writes | Reads, and where it lands |
| --- | --- | --- |
| Experimenter (the lab's profile and the Exa search) | the data profile; each search result | |
| Referee | each valid observation; each rejected option as an objection | |
| Critic | each finding: a `block` as an objection, a `warn` as an observation | before each review, into `contract["recalled_evidence"]` in its prompt |
| Designer | | before each design, merged into its evidence list |
| Proposers (statistician, bioinformatician, sceptic) | | at proposal time, into their prompts' `recalled` field |
| Reporter | with `cfg.lessons`, each settled question's lesson | |

Every run writes the profile; the referee writes once a diagnostic is valid or an option is rejected, and the critic once it finds anything. The proposers read in every run, the designer for each question it designs for, and the critic for each review. The critic's prompt carries records the experimenter and the referee wrote, and in a repair round its own earlier objections. Every write and every orchestrator recall is in the event log as `memory.written` and `memory.recalled`, whose `authors` show whose record each reader used; the proposers' recalls are logged in the memory journal only. Objections are kept in every later recall, so a veto is never dropped.

Recalled records only inform prompts. Beliefs change only through the orchestrator's Bayes update on a new observation, and a record the run already holds is never counted twice: the designer's evidence is deduplicated by evidence id, and the proposers' recall drops the profile they already receive. With `cfg.lessons` on, lessons are written for review and are not reused within or across runs; the reviewed corpus in `memory/lessons.py` is loaded only by the paired lessons comparison for now.

## Credits

The stack uses FastAPI, Uvicorn, Pydantic, HTTPX, the OpenAI SDK, exa-py, Modal, NumPy, pandas, and Langfuse. Development tooling includes uv, pytest, and Ruff. The benchmark designs reference BixBench3 and BoxingGym. Shared memory uses [past.dev](https://past.dev/) ([API contract](https://past.dev/docs/memory-api/api-reference), [audience access controls](https://past.dev/docs/memory-api/access-control)).

## Contributing

Use one branch per Linear issue and a small pull request into `main`. Run the tests and lint checks above. Credit borrowed code, libraries, models, and APIs here.

Every commit must be reviewed and made by a teammate during the event, using their own Git name, email, and GitHub login. Omit co-author and generated-by trailers from commits and pull requests. List human contributors only.
