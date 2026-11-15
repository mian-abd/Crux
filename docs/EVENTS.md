# Run events: the contract between the engine, the API and the UI

Every run writes one JSON object per line to `runs/<run_id>/events.jsonl`. The orchestrator writes it, the API server streams it (it replays the file, then follows new lines), and the UI renders it. Replay files in `runs/demo/` use the same format. This file is the contract: change it only after saying so in Discord.

## Envelope

```json
{"run_id": "r-20261114-153012-a1b2", "seq": 17, "ts": 1794700212.481, "type": "belief.updated", "payload": {}}
```

* `seq` starts at 0 and increases by 1 within a run, with no gaps.
* `ts` is Unix time in seconds (float).
* Objects inside payloads are the pydantic models from `docs/ERD.md` §4.2 dumped with `model_dump(mode="json")`. Their field names are the contract too.
* Consumers must ignore unknown event types and unknown payload fields.

## Event types and payloads

| Type | Payload | Notes |
| --- | --- | --- |
| `run.started` | `{"lab": str, "goal": str, "config": {...}, "started_at": iso8601}` | `config` holds the ablation flags and the role → model map |
| `profile.done` | `{"evidence": [Evidence]}` | The first look at the data or setup |
| `question.opened` | `{"question": Question}` | Includes the ones raised by the fork library |
| `hypothesis.proposed` | `{"hypothesis": Hypothesis}` | One event per option, including `h0` (`is_null: true`) |
| `hypothesis.merged` | `{"question_id": str, "kept": str, "merged": [str], "priors": {hypothesis_id: float}}` | `priors` is the full prior over the question's options after merging |
| `experiment.proposed` | `{"experiment": Experiment}` | `code` may be long; the UI shows it collapsed |
| `experiment.scored` | `{"question_id": str, "ranking": [{"experiment_id": str, "kind": str, "goal": str, "eig_bits": float, "est_cost_s": float, "est_cost_usd": float, "score": float}], "chosen": str}` | `ranking` is sorted by `score`, best first. For numeric labs `experiment_id` is a design label such as `"x=1.75"` |
| `experiment.started` | `{"experiment_id": str, "question_ids": [str], "kind": str}` | |
| `experiment.log` | `{"experiment_id": str, "stream": "stdout" \| "stderr", "line": str}` | One line per event, truncated to 500 characters |
| `experiment.finished` | `{"observation": Observation}` | `bin_id` is set for categorical labs, `value` for numeric ones |
| `referee.verdict` | `{"experiment_id": str, "valid": bool, "note": str}` | Invalid runs never produce a `belief.updated` |
| `belief.updated` | `{"question_id": str, "experiment_id": str, "observed": str \| float, "prior": {hypothesis_id: float}, "posterior": {hypothesis_id: float}}` | `observed` is the bin id, or the measured value for numeric labs |
| `model.curves` | `{"question_id": str, "x": [float], "families": {hypothesis_id: {"mean": [float], "sd": [float], "weight": float}}, "points": [{"x": float, "y": float}]}` | Numeric labs only, after each update: what the UI plots |
| `hypothesis.rejected` | `{"question_id": str, "hypothesis_id": str, "evidence_id": str \| null, "reason": str}` | Feeds the rejected ledger |
| `question.settled` | `{"question_id": str, "hypothesis_id": str, "posterior": float}` | Max posterior ≥ 0.9 |
| `question.robust` | `{"question_id": str, "answer_key": str}` | Every active option leads to the same deliverable |
| `question.unresolved` | `{"question_id": str, "reason": str, "top": [str]}` | Best EIG under 0.05 bits, or out of experiments |
| `surprise.raised` | `{"question_id": str, "experiment_id": str, "reason": str, "z_score": float \| null, "null_mass": float \| null}` | Followed by new `hypothesis.proposed` events when options are regenerated |
| `search.done` | `{"experiment_id": str, "query": str, "urls": [str], "blocked": [str], "bin_id": str \| null}` | `blocked` lists URLs the leakage policy removed |
| `memory.written` | `{"evidence_id": str, "author_role": str, "backend": str}` | |
| `memory.recalled` | `{"reader_role": str, "query": str, "evidence_ids": [str], "authors": [str], "backend": str, "latency_ms": float}` | `authors[i]` wrote `evidence_ids[i]`; this is how the UI shows one agent using another's record. Start-of-run recall from a frozen lesson corpus (`backend` `local_lessons`, see `docs/LESSONS.md`) adds `corpus_sha256` and `case_id` |
| `artifact.written` | `{"artifact": Artifact}` | Emitted when an artifact is written, and again after each critic round with the same `sha256` and the verdict set (`contract_ok`, `findings`). A repeat with the same `sha256` is the same version, not a new one |
| `critic.finding` | `{"finding": CriticFinding}` | |
| `lesson.written` | `{"lesson": Evidence}` | |
| `budget.tick` | `{"cost_usd": float, "llm_calls": int, "tokens_in": int, "tokens_out": int, "seconds": float}` | After every model call or experiment; drives the header's cost and time |
| `run.finished` | `{"report": Report, "status": "ok" \| "budget_exhausted" \| "stopped"}` | Always the last event of a successful run |
| `run.error` | `{"message": str, "where": str}` | The last event of a failed run |

## Rules

* The orchestrator writes `run.started` first and exactly one of `run.finished` or `run.error` last.
* Replaying a file through `core/replay.py` must rebuild the same final beliefs as the recorded `belief.updated` events.
* Nothing from the grader ever appears in an event file. Grades live in `eval/results/`.
* Keys and other secrets never appear in any payload.

## DU-45 optional provenance fields

Existing envelope keys and required payload fields are unchanged. Payloads may also
contain `traces`, a list of `{trace_id, run_id, role, step, prompt_sha256, model,
cached, url}` references. `url` is null when no Langfuse project is configured.
Question and experiment cards use these references, including when replaying SSE.
The API snapshot exposes the same references as `decision_traces` keyed by question
or experiment ID. Trace references contain no credentials or prompt text.

`experiment.started.spec_hash` identifies the canonical code/query/design/bins
specification durably saved in the manifest before the event and execution.

Numeric `experiment.proposed` includes `replay_prior` on its first measurement.
Numeric `belief.updated.log_likelihood` maps hypothesis IDs to the predictive log
likelihood of the observation, computed before the particle update. A null entry
means negative infinity. Replay independently recomputes the family probability
update with these sufficient statistics. It does not execute model code or
regenerate particle clouds. Historical numeric logs without these statistics
remain displayable but fail full replay verification.

## One Letter (`lab = "oneletter"`): `dna.*` events

Additive: the types above are unchanged. The One Letter engine (`labs/oneletter/lab.py`, contract in
`tools/ONE_LETTER_CONTRACT.md`) asks one categorical question, `q-variant` ("Which HBB variant is on
this strip?"), with options `h-hba`, `h-hbs`, `h0` (null), plus `h-hbc` when a lesson lists it and any
option it regenerates after a surprise. It emits the standard types and these:

These are lab events, not core ones (`core/events.py` does not list them), so they are listed here
rather than in the core table above:

* `dna.request` `{"window": int, "reason": str, "eig_bits": float, "replicate": bool}`: asks for a
  window. The engine then calls the reader's `POST /show {"window": n}` (the strip page follows it) and
  polls `GET /read` until that window is stable. Also carries `experiment_id` and `strip`.
* `dna.read` `{"experiment_id": str, "window": int, "bases": str, "expected": {hypothesis_id: str},
  "mismatch_positions": [int], "confidence": [float]}`: `expected` is each real option's predicted 9
  letters; `mismatch_positions` (0-8) are where the read differs from the closest prediction, named in
  `closest`. Also carries `bin_id`, `replicate` and `strip`.
* `dna.variant` `{"hypothesis_id": str, "name": str, "hgvs": str, "legacy": str, "rsid": str, "codon":
  str, "amino_acid": str}`: after every `hypothesis.proposed` of `q-variant`, `h0` included (empty
  strings). It repeats for the same `hypothesis_id` when the question is reopened, so key it by
  `hypothesis_id`. Also carries `source` (the citation).
* `dna.verdict` `{"hypothesis_id": str, "name": str, "posterior": float, "reads": int, "text": str,
  "author": str, "latency_ms": float | null, "pdb_id": str, "residue": 6}`: after `question.settled`.
  `author` is `"jetson/<model>"` (the reader's `POST /verdict`, `qwen2.5:3b` on the Jetson) or
  `"template"` when that fails or when no model sentence passes the fact check
  (`labs/oneletter/verdict_check.py`: every sequence, codon, amino acid, code, name and number
  in it must come from the prompt's facts; a rejected sentence gets one retry). `pdb_id` is `2HBS` for HbS and `1A3N` (deoxy human haemoglobin)
  otherwise. Also carries `legacy` and `strip`.
* `dna.lesson` `{"added": [hypothesis_id], "lessons_total": int}`: a regenerated option settled and was
  saved to `runs/oneletter_lessons.jsonl`; the next run starts with it.

How the standard types are used in a `oneletter` run:

* `run.started.config` holds `reader_url`, `annotated_url` (`reader_url + "/annotated_stream"`),
  `fake_reader` (true for the fake reader: no camera, a recorded or test run), the engine settings and
  `lessons_loaded`.
* Experiment ids are `window-<n>` for the first read of window n, `window-<n>-r<k>` for its k-th read
  (a replicate), with `-s<m>` appended on the m-th sample of a watch-mode run (m >= 2). Ranking rows
  of `experiment.scored` also carry `window` and `replicate`.
* `experiment.proposed` carries each design's table: the bins are the distinct 9-letter strings the
  real options predict for that window, plus `other`. `hypothesis.merged` (`kept: ""`, `merged: []`)
  carries the priors at the start, after a regeneration and when the question is reopened. Together
  they let `core/replay.py` rebuild every `belief.updated`.
* `experiment.log` lines (`experiment_id` = the requested design, or `watch-s<m>` while watching)
  report progress while the engine waits for the camera, so a stuck read is visible.
* `surprise.raised` follows a read in `other` (or a Crux surprise). It also carries `window`, `bases`,
  `mismatch_positions`, `closest` and `predictive`. The next request is a replicate; if it reads the
  same letters, the regenerated option follows (`hypothesis.proposed`, `dna.variant`,
  `hypothesis.merged`, `experiment.proposed`), then the strip's reads are re-scored as
  `belief.updated` events with `"replay": true`.
* In watch mode, when the watched window's letters change (a new sample on the strip page),
  `question.opened` repeats for `q-variant` with `"reopened": true`, `strip` and `reason`, followed by
  `hypothesis.proposed` and `dna.variant` for every option and `hypothesis.merged`.
* `question.unresolved` ends a sample that timed out, read letters too far from HBB to name, or did
  not settle within the read budget. A timeout finishes the run with `status: "stopped"`.

## Claims (`lab = "claims"`): `claims.source`

Additive: the types above are unchanged. The claims lab (`labs/claims`, see `docs/CLAIMS.md`) audits a
hand-curated set of four claims from Love, Huber & Anders (2014), DESeq2, with the standard types plus
one lab event. `core/events.py` names it `CLAIMS_SOURCE` and lists it in `LAB_EVENT_TYPES` (events the
orchestrator emits for one lab, through `LabHooks.opening_events`), not in the core `EVENT_TYPES`:

* `claims.source` `{"title": str, "citation": str, "url": str, "license": str, "excerpt": str,
  "claims": [{"question_id": str, "claim": str, "quote": str, "kind": "symbolic" | "statistical",
  "planted": bool}]}`: emitted once, right after `run.started` (seq 1) and before `profile.done`.
  `excerpt` is our paraphrase of the paper's Methods (the paper is CC BY 4.0; `citation`, `url` and
  `license` attribute it). Each claim's `quote` is a substring of `excerpt` to highlight, or `""`.
  `question_id` is the engine's question id, as in `question.opened`. `planted` is true only for the
  claim added as a known falsehood (`claim-bh-fwer`); it is there to be shown after the fact, and no
  agent reads it.

How the standard types are used in a `claims` run:

* Four categorical questions: `claim-nb-variance`, `claim-wald-calibration`, `claim-bh-fdr` and
  `claim-bh-fwer`. Options are `<question_id>.<answer_key>` plus `<question_id>.h0`; `answer_key` is one
  of `holds`, `fails`, `holds_if`, `alt_param` and `fails_conservative`.
* Experiment ids are the diagnostic names (`nb_variance_symbolic`, `wald_pergene`, ...).
  `experiment.proposed` carries the code, the bins and `design.stated`, what each option predicts;
  `experiment.log` streams the script's output; `referee.verdict` notes start with `code referee:`.
* `artifact.written` delivers `CLAIMS.md`.
