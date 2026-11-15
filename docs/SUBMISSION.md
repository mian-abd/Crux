# Crux: submission write-up

SF AI Research Hackathon, Track 3 (AI Scientist Swarms). Benchmark: Edison Scientific's BixBench3, task 9. Repository: https://github.com/mian-abd/Crux.

Every number below comes from a file in this repository, cited next to it. Where we have no measurement we say "not measured". Task 9 results are a pilot: one task of 20, from published counts.

## Project description (150 words)

Crux is a team of AI scientists that settles disagreements by running the most informative experiment instead of voting. Proposer agents and a library of pre-registered checks raise competing options, such as whether two samples were swapped. A predictor states what each option expects from each diagnostic. The orchestrator runs the diagnostic with the most expected information per cost in a network-blocked Modal sandbox, and a blind referee validates the result before a Bayes update. Every rejected option keeps the evidence that rejected it. In a pilot on one BixBench3 task from published counts, on 13 fresh pre-registered cases, the swarm scored 0.811 against 0.608 for a single GPT-5.5 agent (paired difference +0.20, 95% CI 0.05 to 0.38) and caught 12 of 12 planted faults against 3. On a reused suite, scores were tied, and random experiment selection did as well.

Sources: `eval/results/task9_batch04.md` and `eval/results/task9_batch03.md`.

## Where to look

- **Live site:** https://crux-site-production-95830f5f.up.railway.app (sign up, replay the recorded runs, run the free claims audit, the 3D Explore gallery). The engine API behind it is https://crux-api-production-fef3e0e8.up.railway.app. It has no OpenAI or Modal keys, so it cannot start paid Task 9 runs (`docs/DEPLOY.md`).
- **The loop:** `core/orchestrator.py`. The README has a diagram and a step-by-step map to its functions.
- **Latest results:** `eval/results/task9_batch03.md`, its protocol `eval/results/task9_protocol_batch03.md` (pushed before any run, PR #48) and raw outputs in `eval/results/task9_batch03/`. Earlier batches: `task9_batch02.md`, `task9_batch01.md`, `task9_runs.md` in the same folder.
- **Charts:** `docs/figures/batch-03/` (swarm versus single agent, per case, faults caught). Batch-02's charts are `docs/figures/task9_*.png`; real-data fault detection, the airway label swap and predictor calibration are also in `docs/figures/`.
- **A real run you can replay:** `runs/demo/task9_real_swarm_run1.jsonl`, the first officially graded run. `uv run python -m core.replay runs/demo/task9_real_swarm_run1.jsonl` re-derives all 11 Bayes updates from the log. The API serves it under `/replays` for the UI.
- **The run with search and memory on:** `runs/demo/task9_tools_run2.jsonl` (`tools-run-02`; see Exa and past.dev below).
- **Claims audit (MVP):** `uv run python -m core.cli --lab claims` audits four curated claims from the DESeq2 paper with SymPy and simulations, no API key needed. The recorded run is `runs/demo/claims_deseq2.jsonl`; details in `docs/CLAIMS.md`. Extraction from any paper and formal proofs are next.
- **Consumer site:** `site/`. Run the API with `CRUX_CORS_ORIGINS=http://localhost:3000 uv run uvicorn api.server:app --port 8001`, then `cd site && npm ci && npm run dev` (`site/README.md`). It has accounts, PDF upload with claim extraction, a live claims audit view and 3D views (`site/components/viz/README.md`).
- **Cloud evaluations:** `eval/cloud.py` and `docs/CLOUD.md` (see Modal below).
- **BoxingGym study:** `eval/results/boxing/README.md` (DU-41, repaired study).

## Track 3: AI Scientist Swarms

### Results against the baseline and the record (pilot)

**Protocol.** One BixBench3 task (task 9) out of 20. Both arms start from the published count matrix (Edison's artifact 1), not raw reads. Edison's deterministic grader at commit `d0e0bbb` scores the 9 required artifacts; a run's score is their mean (`eval/results/task9_runs.md`). Both arms get the same Modal image, inputs, prompt, $2 cap and 40-call limit (`eval/results/task9_protocol.md`).

**The record.** The 0.523 full-suite record covers all 20 tasks and starts from raw data. Our numbers are one task from counts, so they are not comparable to it, and we do not compare them (`eval/results/task9_runs.md`).

**The baseline.** A single ReAct agent on gpt-5.5 that plans, runs code, checks and revises (`eval/baseline_agent.py`).

**Batch-04: a fresh held-out suite** (`eval/results/task9_protocol_batch04.md`, `eval/results/task9_batch04.md`). Pre-registered in PR #59. 13 cases made fresh with `make_cases --seed 44` (no input bundle shared with the seed-43 suite), both arms once each, in Modal at commit `95aaa11`. 26 runs, $33.14 of a $45 cap, no crashes, no reruns.

| Measure | Swarm | Single agent |
| --- | --- | --- |
| All 13 cases | **0.811 ± 0.078** | 0.608 ± 0.305 |
| 12 fault cases | **0.807 ± 0.080** | 0.586 ± 0.307 |
| Clean case, one run | 0.861 | 0.869 |
| Paired difference, 13 cases (95% CI) | **+0.203 (+0.048 to +0.382)** | |
| Faults caught / noticed only / missed, of 12 | **12 / 0 / 0** | 3 / 2 / 7 |
| Mean cost per run; runs stopped by the $2 cap | $1.17; 0 | $1.38; 7 |

Two single-agent runs scored 0 and count as pre-registered. On `h44-case-01` it concluded `/data` was empty: in our sandbox `/data` is a symlink, and its listings didn't follow it, though every input had been verified. On `h44-case-07` it hit the $2 cap. Sensitivity, not pre-registered: without `h44-case-01` in either arm, +0.147 (+0.025 to +0.299); without both, which can only favour the single agent, +0.089 (+0.002 to +0.189). The library-checks caveat applies: these are new instances of the six fault types the library was written for.

**Batch-03 scope** (`eval/results/task9_protocol_batch03.md`, `eval/results/task9_batch03.md`). Pre-registered in PR #48 before any run. Code commit `19cd67c`, everything in Modal (PR #49). 52 runs: the 13-case suite for both arms (the clean case plus 2 each of six planted faults, `make_cases` seed 43, one run per arm per case), 2 more clean runs per arm, a lessons arm on the 9 held-out test cases and a random-selection arm on all 13. Inputs include the task's own `gencode.v38` symbol map. Exa and past.dev were stripped from every arm, and failed runs count as 0. The 52 runs cost $56.93 against a $100 cap, with no run skipped for budget.

**Pre-registered (crashed runs count as 0)**, from `eval/results/task9_batch03.md`:

| Measure | Swarm | Single agent |
| --- | --- | --- |
| Clean case, 3 runs | 0.576 (0.000, 0.861, 0.866) | **0.860** (0.861, 0.866, 0.853) |
| 12 fault cases | 0.734 ± 0.246 | 0.732 ± 0.160 |
| All 13 suite cases | 0.678 ± 0.311 | 0.742 ± 0.158 |
| Paired difference, 13 cases (95% CI) | −0.064 (−0.242 to 0.080) | |
| **Faults caught / noticed only / missed, of 12** | **11 / 0 / 1** (the miss is a crashed run) | 4 / 2 / 6 |
| Failed runs (scored 0) | 2 (merge-step crash) | 0 |
| Runs stopped by the $2 cap, still graded | 1 | 6 |
| Mean cost, calls, median time per suite run | $0.93, 16.5, 278 s | $1.34, 18.8, 305 s |

**Labelled deviation: the three crashed swarm runs, rerun after the fix.** The merge model put an option under the wrong question, and our code raised instead of dropping the bad grouping. PR #54 fixed it; the three runs were repeated once at commit `8ffac76` with the same inputs, models and caps, for $3.43. These numbers sit next to the pre-registered ones, never in place of them:

| Measure | Swarm, crashed runs rerun | Single agent |
| --- | --- | --- |
| Clean case, 3 runs | **0.862** (0.861, 0.861, 0.866) | 0.860 |
| 12 fault cases | 0.806 ± 0.086 | 0.732 ± 0.160 |
| All 13 suite cases | 0.810 ± 0.084 | 0.742 ± 0.158 |
| Paired difference, 13 cases (95% CI) | +0.068 (−0.013 to 0.167) | |
| Per case: higher / lower / tied | 5 / 5 / 3 | |
| **Faults caught, of 12** | **12** | 4 (plus 2 noticed) |
| Lessons on minus off, 9 test cases (95% CI) | +0.010 (−0.059 to 0.089) | |
| Information-gain minus random selection, 13 cases (95% CI) | −0.000 (−0.001 to 0.001) | |
| Mean cost per suite run: information gain vs random | $1.13 vs $1.14 | $1.34 |

Intervals are 95% bootstrap intervals over cases (10,000 resamples, seed 0).

**The progression, with what changed in between.** The inputs and the prompt changed, so this is not a learning curve.

| Runs | Inputs and prompt | Swarm | Single agent | Source |
| --- | --- | --- | --- | --- |
| Run 1 | Counts and sample sheet, no gene annotation (bundle `160253fe…`); before the shared prompt rule | 0.586 (5 of 9 at or above 0.80) | not run | `eval/results/task9_runs.md` |
| batch-01, 3 swarm runs | Same bundle; before the shared prompt rule | 0.628 ± 0.046 (0.650, 0.576, 0.659) | stopped early, not graded | `eval/results/task9_batch01.md` |
| Paired clean case (DU-22), 1 run per arm | Counts, sample sheet, GENCODE v43 symbol map; the shared rule was written after this pair was graded | 0.727 (3 of 9) | **0.862** (8 of 9) | `eval/results/task9_runs.md` |
| batch-02 clean, 3 runs per arm | The task's own `gencode.v38` map; shared prompt rule (PR #30) | 0.833 ± 0.038 | **0.868 ± 0.002** | `eval/results/task9_batch02.md` |
| batch-02 suite, 13 cases | As above | 0.785 ± 0.099; 12 of 12 faults caught | 0.484 ± 0.365 pre-registered, 0.741 ± 0.158 with 4 crashed runs rerun; 3 of 12 caught (5 with reruns) | `eval/results/task9_batch02.md` |
| batch-03 clean, 3 runs per arm | As batch-02, plus untested questions keep method defaults (PR #47) | 0.576 pre-registered; **0.862** with the crashed run rerun | 0.860 | `eval/results/task9_batch03.md` |
| batch-03 suite, 13 cases | As above | 0.678 ± 0.311 pre-registered, 0.810 ± 0.084 with 2 crashed runs rerun; 11 of 12 caught (12 with the rerun) | 0.742 ± 0.158; 4 of 12 caught | `eval/results/task9_batch03.md` |

**What we conclude:**

- **The clean-case gap closed.** On finished runs, 0.862 against 0.860. Pre-registered it did not, because one swarm clean run crashed and counts as 0. The fix (PR #47) was written after seeing clean-case grades, so clean-case scores count as tuned (`eval/results/task9_batch03.md`).
- **Fault handling is the clear difference, with a caveat.** The swarm caught 12 of 12 (11 pre-registered), the single agent 4 plus 2 noticed. The swarm's library has checks for exactly the six fault types the suite plants, so this does not show detection of faults nobody wrote a check for.
- **On this reused suite, overall scores are statistically tied.** Both paired intervals include zero. On the fresh seed-44 suite (batch-04, above) the swarm scored higher and the interval excludes zero.
- **Random experiment selection matched information-gain selection** on score (0.810 vs 0.810), cost ($1.14 vs $1.13 per run) and faults (11 of 12 vs 12, or 11 pre-registered). Crux's selection rule showed no measurable advantage on this suite. With about a dozen library diagnostics and a $2 budget, random order still reaches the diagnostics that matter (`eval/results/task9_batch03.md`). The BoxingGym study found no advantage either (below).
- **Lessons on vs off had no measurable effect:** +0.010 on 9 held-out cases (95% CI −0.059 to 0.089).
- **Run 1 and batch-01 had two zeros by construction.** The shared-gene lists are keyed by gene symbol, and those inputs had no annotation (`eval/results/task9_batch01.md`).
- **Swarm variance on the clean case.** The three batch-01 swarm runs on identical inputs ranged from 0.576 to 0.659 (`eval/results/task9_batch01.md`), and the batch-02 swarm clean runs from 0.790 to 0.861. In batch-03, after PR #47, every finished swarm clean run scored 0.861 or 0.866 (`eval/results/task9_batch03.md`).

### BoxingGym: a second test of the selection rule

`labs/boxing/` ports BoxingGym's Location Finding environment (MIT). The repaired DU-41 study ran six arms on 20 paired seeds: 120 episodes and 360 checkpoints, with failed checkpoints kept in every aggregate. **It does not establish an EIG advantage.** The paired mean log10 MSE, Crux EIG minus Crux random, was +0.5542 at 20 measurements (95% CI −0.0298 to 1.6071; negative favours EIG). Plain random design had the lowest median MSE at 20 measurements (8.737). Wrapper-accounted spend was $0.1055536. This is simulator evidence (`eval/results/boxing/README.md`).

### What the swarm rejected

Judges asked for this explicitly. A Crux run reports what it rejected and what it could not decide, with the evidence, as part of its output (`Report.rejected`, `Report.unresolved`, and the UI's rejected ledger).

**In run 1** (`runs/demo/task9_real_swarm_run1.jsonl`), 18 questions were opened, 5 settled and 13 ended unresolved. Five options were rejected, each by a sandboxed diagnostic whose bin was computed by code and accepted by the referee:

| Question | Rejected option | Rejected by | Posterior at rejection |
| --- | --- | --- | --- |
| Were two samples swapped? | "Two libraries in one cell line carry each other's condition labels" | `labels_swap_search` observed `as_given` | 0.0021 |
| Is a library duplicated? | "One library appears under two sample names" | `duplicates_identical` observed `none` | 0.0085 |
| Is a library degraded? | "At least one library is degraded" | `quality_depth` observed `all_usable` | 0.0085 |
| Is the cell-line column wrong? | "Some libraries carry the wrong cell line" | `cell_line_centroid` observed `as_given` | 0.0085 |
| Are gene-ID versions mixed? | "Versioned and unversioned Ensembl IDs are mixed" | `gene_strip_check` observed `uniform` | 0.0046 |

**Rejected by a search, in tools-run-02** (`runs/demo/task9_tools_run2.jsonl`). On the question "Should filtering of low-count genes be applied before DESeq2 fitting?", the option "use DESeq2's internal independent filtering only" fell to posterior 0.0172 after `search-independent_filtering` observed `both`: the DESeq2 documentation it returned covers both manual pre-filtering and independent filtering in `results()`.

**Left unresolved, and why.** In run 1, all 12 questions the proposers raised (design formula, pre-filtering, multiple-testing threshold, effect-size threshold, how the shared and D4-specific sets are defined, gene-ID format, normalisation, the row key of the shared lists, label swaps, duplicates, outliers, depth) ended "no new informative experiment was proposed". The designer is a stand-in in `agents/swarm.py` that only returns library diagnostics, and it has none for them. The group-direction fork ended unresolved after its second check returned `unclear`. Reporting these as unresolved, instead of guessing, is the intended behaviour. Since PR #47, the delivery planner keeps the method's documented defaults for a question no diagnostic tested (`eval/results/task9_protocol_batch03.md`).

**Blocked by the critic.** Round 1 blocked versioned gene IDs in 7 DE tables. The repair round fixed all but one `_PAR_Y` ID in 4 tables (`eval/results/task9_runs.md`).

**On real public data** (`eval/results/real_data_diagnostics.md`), the diagnostics rejected "labels as given" in GEO GSE52778 (airway). An independent dexamethasone-signature check agrees: in donors N052611 and N080611 the library labelled albuterol scores 2.86 and 3.11 and the one labelled albuterol + dex scores 0.36 and 0.55. We found no public report of this swap, and the authors have not confirmed it. On a borderline post-mortem COVID lung library, the two quality checks disagreed, so the question stayed open. The direction checks abstained (`unclear`) on all four cases, which have no two-cell-line perturbation to compare.

**In the claims audit** (`docs/CLAIMS.md`), the engine refuted the planted claim "Benjamini–Hochberg controls the FWER" with a counterexample: 3 tests with 2 nulls give FWER 0.0659 (99.9% lower bound 0.0641), and `holds` fell to 0.017. It also rejected the parametrisation mix-up μ + μ²/α for the negative binomial variance, and "Wald p-values are calibrated whichever dispersion is used" (false-positive rate 0.1139 with per-gene dispersion, against 0.05755 with moderated dispersion on the same data).

**What we rejected ourselves, and the evidence:**

- **Per-pair DESeq2 refits.** They recovered 427 of 1,232 reference genes on C10 versus control, where one fit per cell line recovered all of them. The shared fallback prompt now asks for one fit per cell line. This rule was written after seeing clean-case grades, so clean-case scores from then on count as tuned (`eval/results/task9_runs.md`, `eval/results/task9_protocol_batch02.md`).
- **Applying the proposers' top option to untested questions.** In batch-02 the untested low-count-filtering question was applied three different ways in the three clean swarm runs (0.790, 0.850, 0.861). PR #47 keeps method defaults instead (`eval/results/task9_protocol_batch03.md`).
- **A merge step that crashes on a bad plan.** It killed three batch-03 swarm runs; PR #54 keeps the proposals unmerged instead (`eval/results/task9_batch03.md`).
- **The original `cell_line_pc1` rule.** It called two damaged COVID lung samples colon. The new rule needs a library deep in the other group; 24 of 24 planted cell-line swaps are still caught (`eval/results/real_data_diagnostics.md`).
- **Letting the fine-tuned predictor replace the library's stated rows.** It wins on synthetic data in distribution, loses its edge under shift, and loses to the stated rows on a held-out real dataset, so it is off by default (`eval/results/predictor_calibration.md`, `eval/results/predictor_real_data.md`, `CRUX_TINKER_OVERRIDE_STATED`).
- **Merging the library's forks with the proposers' questions.** On the first real run the merge model folded five forks and unrelated questions into one 20-option question. Library forks now skip the merge (`agents/swarm.py`, `SwarmRoles.propose`).
- **Model-chosen outcome bins for search.** The original search design let a model pick the bin; code computes it now (`docs/SEARCH.md`).
- **A claim that information-gain selection beats random selection.** Neither batch-03 nor the BoxingGym study shows it.
- **A claim that shared memory or lessons help.** We have no measurement that supports either (see past.dev below, and the lessons arm above).

### Rigour

- **Pre-registration.** Each batch's protocol was committed before it ran: batch-01 (`eval/results/task9_protocol.md`), batch-02 (`eval/results/task9_protocol_batch02.md`, code commit `799febd`) and batch-03 (`eval/results/task9_protocol_batch03.md`, PR #48). Deviations are reported as deviations: the stopped batch-01 baseline runs (`eval/results/task9_batch01.md`), the four rerun single-agent crashes in batch-02 and the three rerun swarm crashes in batch-03, always next to the pre-registered numbers. Because the seed-43 cases had been run and graded twice by the end of batch-03, batch-04 was pre-registered on a fresh seed-44 suite in PR #59 before it ran (`eval/results/task9_protocol_batch04.md`); its results, with no crashes and no reruns, are in `eval/results/task9_batch04.md`.
- **Failures count.** Failed or ungraded runs score 0 in every pre-registered mean, and every run is listed (`eval/run_task9_arms.py`, `summarise`; `eval/suites/task9/grade_suite.py`). Runs not started for budget would be listed as `not run: budget` (`docs/CLOUD.md`); in batch-03 there were none.
- **Code decides outcomes.** A diagnostic prints one `RESULT:` line; bins are exhaustive, exclusive rules evaluated by code (`labs/bixbench3/bins.py`). The specification and its SHA-256 are saved before the run, and a spec cannot run twice in a run (`core/orchestrator.py`, `spec_hash`, `_prepare`; `docs/OBSERVABILITY.md`).
- **A blind referee.** The referee's model sees only the experiment's kind, goal, language, code and query, the bin ids and rules, the observed bin, the result and a log tail. It never sees option statements, priors, posteriors or likelihoods (`agents/referee.py`, `SPEC_FIELDS`).
- **Room to be wrong.** Every question has a "none of these" option at prior 0.15, and predictor rows are floored so no outcome is impossible (`core/config.py`; `agents/predictor.py`, `LIBRARY_FLOOR`).
- **Two independent checks per fork.** Each library fork has two diagnostics with different code, so two agreeing results can settle a question past 0.9 even with the "none of these" option in play (`diagnostics/de_from_counts/library.py`).
- **Independent repeats.** Since batch-03 every run has its own LLM response cache; in batch-02 the cache was shared, so runs with identical prompts could replay each other's answers (`eval/results/task9_protocol_batch03.md`).
- **Stated asymmetries.** The baseline caps each answer at 4,096 tokens and uses gpt-5.5 throughout; the swarm uses gpt-4.1-mini for proposers and the predictor (`eval/results/task9_protocol.md`). The baseline hit the $2 cap in 6 of 13 batch-03 suite runs and was still graded (`eval/results/task9_batch03.md`).
- **Leakage controls.** Listed in the README: one task, counts as input, references in evaluator-only storage, a network-blocked sandbox, the search policy, possible model memorisation, and rules informed by clean-case grades.

### Novelty

We do not claim to have invented LLM-guided experimental design. BED-LLM combines LLM beliefs with expected-information-gain selection, and HypoAgents does Bayesian multi-agent hypothesis refinement (`docs/research/DU-37-rigour.md`). What we think is new is the combination, applied to executable computational-biology reproduction: analysis forks become questions, pre-registered diagnostics with code-computed bins compete with documentation searches on EIG per cost, a blind referee gates every update, "unresolved" is a first-class result, and every rejection is tied to the evidence that caused it. The same engine audits paper claims with symbolic and simulation diagnostics (`docs/CLAIMS.md`). On real public data, its diagnostics surfaced an apparent, unconfirmed label swap in GEO GSE52778. We also report that the EIG ranking itself showed no measurable advantage over random order in either test we ran.

### Autonomy and self-improvement

- **Autonomy.** After `core.cli` starts, no human acts until the report is written: profiling, proposals, experiments, delivery, critique and the methods write-up all run unattended, within $2, 40 model calls and 30 minutes (`core/config.py`). Run 1 used 20 model calls, $1.03 and 293 s (`eval/results/task9_runs.md`). Batch-03's 52 runs were started by one command and ran, graded, in Modal (`eval/results/task9_batch03.md`, `docs/CLOUD.md`).
- **Self-correction within a run.** The critic's block findings send the run back to delivery once; in run 1 the repair round fixed the versioned IDs in 7 tables, except one `_PAR_Y` ID in 4 of them. A surprise (an outcome the options did not predict) triggers option regeneration in the engine (`_regenerate`), but the swarm's regeneration is still a stand-in that adds no options.
- **Learning across runs: measured once, no effect.** Six lessons drafted from the four dev cases' runs were reviewed, frozen and given to a lessons arm on the 9 held-out test cases. Lessons on minus off was +0.010 (95% CI −0.059 to 0.089) (`eval/results/task9_batch03.md`). The reviewer had seen batch-02's test-case results (`eval/results/task9_protocol_batch03.md`). With `lessons` on, each settled question's lesson is written for human review and never reused unreviewed (`docs/LESSONS.md`).
- **Learning from its own diagnostics.** The Tinker predictor was trained on the lab's own diagnostic outcomes. It is better calibrated on synthetic data in distribution, and not under shift or on held-out real data (see Tinker below).

### Interpretability and reproducibility

- **Everything is an event.** Each run writes `runs/<run_id>/events.jsonl` in the contract of `docs/EVENTS.md`: questions, options, rankings with EIG and cost, verdicts, belief updates, rejections, memory reads with their authors, searches with blocked URLs, critic findings and budget ticks. The UI and the site are driven only by these events.
- **Replay.** `core.replay` re-derives every Bayes update from the log and fails on a corrupted trajectory. On run 1 it recomputes all 11 updates.
- **Provenance.** `runs/<run_id>/manifest.json` records model IDs, prompt hashes, the Git revision, verified input digests, the sandbox image ID, seeds and the full configuration (`docs/OBSERVABILITY.md`). Since PR #38 it also records `tools_connected`, the search and memory the run actually had (`core/manifest.py`). Run 1 shows why: its `run.started` config lists memory `"pastdev"` and search on, but neither was connected, because the integrations were not merged yet (`eval/results/task9_protocol.md`). For the DU-45 hero run, Langfuse confirmed all 20 generation records (`docs/acceptance/DU-45.md`).
- **Methods from facts.** The reporter's prose is kept only if every number in it comes from the logged facts; otherwise a template writes the methods (`agents/reporter.py`).
- **Exact commands** for every result are in the README and in each results file. What cannot be reproduced exactly: model outputs vary between runs, the official task prompt is gated, and the reference artifacts must come from Edison's buckets into evaluator-only storage.

## Exa

**Where Exa is called in the main loop.** Search is an experiment that competes with the compute diagnostics; it is never a free side channel.

1. `labs/bixbench3/swarm_lab.py`, `build_task9_run`, builds the run's search with `search/task9.py`, `build_task9_search`: `GuardedSearch` (the Task 9 policy) over `ExaSearch`. It exists only when `cfg.search` is on and `EXA_API_KEY` is set.
2. `agents/swarm.py`, `SwarmRoles._attach_search`, attaches pre-registered search diagnostics (`search/task9.py`, `search_diagnostics`) to questions that documentation can decide. There are five: independent filtering, alpha and p-value adjustment, design-formula conventions, `lfcShrink` versus `lfcThreshold`, and raw-count input. Each has a fixed query and bins written as code rules.
3. `core/orchestrator.py`, `_Run._question_round`, has the predictor fill P(bin | option) for the search and ranks it against the compute diagnostics by EIG per cost. A search is costed at 4 s and $0.007 (`search/task9.py`, `SEARCH_COST_S`; `search/exa.py`, `EXA_ESTIMATED_COST_USD`, a configured estimate from Exa's published rate, not an invoice).
4. When a search wins, `_Run._run_categorical` calls `_Run._run_search`, which calls `search.find(exp.query, k=5)`. That goes through `search/task9_policy.py`, `GuardedSearch.find` (query check, then URL and snippet checks), to `search/task9.py`, `ExaProvider.__call__`, to `search/exa.py`, `ExaSearch.lookup`.
5. `_run_search` evaluates the bin rules over `{"n_results", "text", "urls"}`. Every bin requires at least one result, so a search with no usable documentation is invalid and moves no belief. A refused query or a provider error becomes an invalid observation, not a crashed run. The referee then checks the result before the Bayes update.

**How sources are shown.** Each search emits a `search.done` event with the query, the returned URLs, the URLs the policy blocked and the observed bin. Each excerpt is streamed as an `experiment.log` line, `url: excerpt`. The observation keeps the text the bins were computed on, so the referee and a reader see the rules' inputs. The UI's memory and search panel lists the first three URLs and shows blocked URLs struck through (`web/src/components/MemoryPanel.tsx`). Results are written to shared memory as the experimenter's evidence, with their URLs. Every query, URL and denial is also audited in `<runs_dir>/.cache/search/` (`docs/SEARCH.md`).

**Leakage policy** (`search/task9_policy.py`). Exa receives an include-list of documentation hosts (Bioconductor, CRAN, nf-core, Seqera docs, Subread, PyDESeq2 docs, Ensembl) and an exclude-list. Queries, URLs and snippets are screened for the source paper and its DOI, its journal, preprint servers, the study's GEO/SRA/ENA records, PubMed/PMC mirrors, the ground-truth bucket and study terms (glioblastoma, T98G, HEK293, the REST-targeting compounds, the output file names). Exclusions come from public task metadata, never from the ground truth. This is a lexical policy, not a proof of isolation (`docs/SEARCH.md`).

**Evidence: one separately labelled run, no score effect claimed.** Every batch stripped `EXA_API_KEY` from both arms (`eval/results/task9_protocol_batch02.md`, `eval/results/task9_protocol_batch03.md`). Run 1's config said search was on, but search was not connected (see Interpretability above). Search was on in one run, `tools-run-02`: the clean case with Exa and past.dev connected, after PR #38 (`eval/results/task9_batch02.md`). From its event log, `runs/demo/task9_tools_run2.jsonl`:

- Three searches were chosen and run (`search.done`): design-formula conventions (bin `both`), independent filtering (`both`) and the alpha and p-value adjustment defaults (`neither`). The referee accepted all three. In each round the search was the only candidate for its question (`experiment.scored`).
- `search-independent_filtering` rejected an option: "use DESeq2's internal independent filtering only" fell to posterior 0.0172, below the 0.02 bar (`hypothesis.rejected`, evidence `ev-002`).
- The policy blocked 11 returned URLs across the three searches, all Bioconductor support-forum posts (`search.done.blocked`).
- The run's official score was 0.815 (8 of 9 artifacts at or above 0.80), with 26 model calls and $1.05 (`eval/results/task9_batch02.md`). The event log's budget, which also charges the configured $0.007 per search, ends at $1.07.
- The run used the shared default LLM cache (`runs/.cache/llm` in its `run.started` config), not a per-run cache: 11 of its referee calls, all on library diagnostics, were answered from that cache (`cached: true` in the event traces).

One run is in line with the tools-off clean runs of batch-02 (0.790 to 0.861), so it shows no score effect either way (`eval/results/task9_batch02.md`). Search hit rate across runs: not measured. The live smoke check is `uv run --env-file .env python -m search.demo --query "DESeq2 documentation alpha default"`.

## past.dev

**Who writes and who reads** (`core/orchestrator.py`, `agents/swarm.py`, `labs/bixbench3/swarm_lab.py`, `build_task9_run`):

| Role | Writes | Reads |
| --- | --- | --- |
| Experimenter | the data profile; each Exa result | |
| Referee | each valid observation; each rejected option as an objection | |
| Critic | each finding (a `block` as an objection, a `warn` as an observation) | before each review, into its prompt. **The one role whose prompt uses another role's records.** |
| Designer (stand-in) | | recalls before each design; `SwarmRoles.design` ignores what it recalls |
| Proposers | | at proposal time; in a fresh run audience only the profile exists then, and they already receive it |
| Reporter | lessons, only with `lessons` on | |

**The cross-role read.** The critic reviews the deliverables with the experimenter's and the referee's records in its prompt (`contract["recalled_evidence"]`, read by `agents/critic.py`), and in a repair round with its own earlier objections. Every orchestrator recall is logged as `memory.recalled` with the author of each record, so the UI shows one agent using another's evidence; the proposers' recalls are logged in the memory journal only. Objections are mandatory context and are never dropped by recall's `k`. Recalled records only reach prompts; beliefs change only through a Bayes update on a new observation, and a record is never counted twice.

**The store map** (also in the README, "Which memory holds what"):

| Store | Holds |
| --- | --- |
| `runs/<run_id>/events.jsonl` | the run's event log, including every `memory.written` and orchestrator `memory.recalled`; the authority for beliefs and replay |
| `runs/<run_id>/memory/` (SQLite journal) | canonical records, outbox receipts and retries, exact recall requests and responses, latency |
| past.dev | compact evidence envelopes and artifact pointers, in one audience per run |
| Modal and artifact storage | matrices, generated code, artifacts; large files stay out of memory |

**Isolation.** Each run gets its own audience and role-specific reader identities (`memory/run.py`). The tests check audience membership, negative cross-run recall and foreign-source rejection, and `memory.demo` checks that a second run cannot recall a private sentinel (`docs/MEMORY_COMPARISON.md`).

**Evidence: one separately labelled run, no score effect claimed.** Every batch stripped `PAST_API_KEY` from both arms, and run 1's config named `"pastdev"` without a connection (see Interpretability above). In `tools-run-02` (`runs/demo/task9_tools_run2.jsonl`, `eval/results/task9_batch02.md`):

- The critic recalled 8 records, all written by the referee, into its review prompt (its one `memory.recalled` event).
- The designer recalled 24 times; its stand-in ignores what it recalls. The referee wrote 20 records and the experimenter 5 (`memory.written`).

**Latency.** Each recall's latency is recorded in `memory.recalled.latency_ms` and in the journal. Over the 25 recalls in `tools-run-02`, p50 was 569 ms and p95 979 ms (interpolated percentile, `memory/instrumentation.py`, as used by `eval/memory_replay.py`; `eval/results/task9_batch02.md`). The slowest recall took 1,808 ms. These are from one run.

**Honest result: no proven gain.** We have no evidence that shared memory improves Crux. One run had it on, and its score was in line with the tools-off runs. In a Task 9 run only the critic's prompt can change because of another role's record. The comparison arm is ready (`--config crux_role_only_memory`, which shows each role only its own records) but has not been run. The replay harness has run only on a synthetic fixture.

## Modal

**One network-blocked sandbox per run.** `execution/sandbox.py`, `ModalExecutor.open`, creates a `modal.Sandbox` for each run with `block_network=True`, 4 CPUs, 16 GiB of memory, a 3,600 s lifetime and a 600 s idle timeout. The staged inputs are mounted read-only at `/data`. Before anything runs, a script inside the sandbox checks that `/data` holds exactly the declared files and that each file's SHA-256 matches the manifest. Diagnostics time out after at most 120 s; delivery steps after 600 s. Command logs go to `runs/<run_id>/execution.jsonl` and stream to the UI. The egress probe (`verify_isolation`), which tries to reach the ground-truth bucket, runs in the smoke test (`execution/smoke_task9.py`), not in every run. The single-agent baseline uses the same executor and image.

**The R + DESeq2 image** (`execution/image.py`). Micromamba with Python 3.12, `r-base` 4.5, Bioconductor DESeq2, data.table, pandas and NumPy; the full image adds edgeR, apeglm, SciPy, PyDESeq2 and GSEApy. The build fails unless DESeq2 loads in R.

**Staged, hashed inputs** (`execution/staging.py`). Only the counts, the sample sheet and optional metadata can be staged. Each file is hashed; the bundle id is the SHA-256 of the digests, and the files go to the `crux-task9-inputs` volume under that id. Run 1 and batch-01 used bundle `160253fe…` (`eval/results/task9_protocol.md`).

**The cloud runner** (`eval/cloud.py`, `docs/CLOUD.md`). Since batch-03, a whole evaluation launch runs in Modal, so it needs nothing from the launching machine once started:

- **Orchestration:** one orchestrator container per launch (up to 20 hours, non-preemptible) holds the repo at the launching commit, its locked dependencies, and Edison's grader cloned at the pinned commit in its own environment. It runs each job's `eval.run_task9_arms` in order.
- **Sandboxes:** each run's analysis code still runs in its own network-blocked sandbox that mounts only its staged inputs.
- **Grading:** every run is graded in the orchestrator container, after a grader self-test on the references; any failed pre-check stops the launch with nothing spent.
- **Evaluator-only volume:** references, the grading spec, the suite truth, case manifests and lesson sets sit on `crux-evaluator`, mounted read-only and only in the orchestrator container. Results go to `crux-results`, committed every minute so partial results survive.
- **Spend cap:** `--max-total-usd` is required and covers every run of every job. Each run reserves its $2 cap before it starts and starts only if finished spend plus in-flight reservations plus $2 stays within the cap. The first refusal stops the launch, and every run not started is listed as `not run: budget`.
- **Per-run caches:** every run gets its own LLM disk cache (`runs/<run-id>/.cache/llm`), so repeats never replay each other's answers.
- **Recorded commit:** the launcher refuses a dirty tree unless `--allow-dirty` is passed, which is then recorded.

```sh
uv run python -m modal run --detach eval/cloud.py --jobs eval/results/task9_batch03_jobs.json \
  --max-total-usd 100 --launch-id batch-03
uv run python -m eval.cloud status --launch batch-03
uv run python -m eval.cloud fetch --launch batch-03 --to ../evaluator/results
```

**Counts.** Only numbers we can verify from files:

| Count | Value | Source |
| --- | --- | --- |
| Runs in the batch-03 launch | 52: 26 suite, 4 clean, 9 lessons, 13 random selection | `eval/results/task9_protocol_batch03.md` |
| Reruns after the PR #54 fix, outside the launch | 3, $3.43 | `eval/results/task9_batch03.md` |
| Spend cap | $100 for the launch, $2 per run | `eval/results/task9_batch03.md`, `docs/CLOUD.md` |
| Model spend, batch-03 launch | $56.93; no run skipped for budget | `eval/results/task9_batch03.md` |
| Runs at a time | at most 8 per job (`max_parallel` default; `task9_batch03_jobs.json` sets none, and jobs run in order) | `eval/cloud_jobs.py`, `docs/CLOUD.md`, `eval/results/task9_batch03_jobs.json` |
| Runs at a time in batch-02, launched from a laptop | at most 6 (`--max-parallel 6`) | `eval/results/task9_batch02.md` |
| Median sandbox startup | not measured | |
| Total sandbox hours | not measured | |
| Modal spend | not measured | |

## Tinker

**What was fine-tuned.** The outcome predictor: given a diagnostic's goal, its bins, the option assumed true and a compact profile of the data, it gives P(bin | option), which feeds the EIG. A LoRA (rank 16) on Qwen/Qwen3-8B, learning rate 2e-4 with linear decay, batch 64, cross-entropy on the completion tokens only (`eval/train_tinker_predictor.py`, `agents/tinker_predictor.py`).

**On what (DU-29).** 1,720 simulated Task 9-shaped cases (train 1,200, validation 120, test 200, shift 200), each run through all 12 library diagnostics: 20,640 records. The label is the bin each diagnostic actually landed in. The shift split uses knob ranges never seen in training: weak knockout effects and three replicates per group. Early stopping kept the step-240 checkpoint, about 1.07 epochs, with validation loss 0.152 nats per example, down from 3.21 (`eval/results/predictor_calibration.md`).

**Results on synthetic data** (`eval/results/predictor_calibration.md`). Log loss in nats, lower is better, on the forks with no exact library rows:

| Method | Test | Shift |
| --- | --- | --- |
| Library's stated rows | 0.557 | 0.589 |
| gpt-4.1-mini, 8 samples | 0.612 | 0.782 |
| Qwen3-8B base | 0.600 | 0.810 |
| **Qwen3-8B LoRA** | **0.472** | 0.573 |

- In distribution the fine-tune is the best calibrated (ECE 0.059 against 0.170 for the library rows).
- Under shift the edge goes away: with the 0.02 floor that runs use, the library rows score 0.560 and the fine-tune 0.569.
- Argmax accuracy is identical for the library rows, gpt-4.1-mini and the fine-tune; the gain is in calibration, which is what the EIG uses.
- Fine-tuning fixed a base model that sometimes ignored the option entirely.

**Results on held-out real data** (DU-54, `eval/results/predictor_real_data.md`). We planted the six faults into three public datasets and held COVID (Expression Atlas E-ENAD-46, 125 cases) out of every model's training. Two new fine-tunes added real airway and pasilla cases to the synthetic training set, one of them with the doubtful airway label records dropped. Log loss on COVID:

| Method | Forks a model may fill (n = 500) | All forks (n = 1,500) |
| --- | --- | --- |
| **Library's stated rows** | **0.503** | **0.521** |
| gpt-4.1-mini, 8 samples | 0.836 | 0.711 |
| Qwen3-8B base | 1.005 | 1.104 |
| Fine-tune on synthetic only (DU-29) | 0.591 | 0.681 |
| Fine-tune on synthetic + real (DU-54) | 1.095 | 0.627 |
| Fine-tune on synthetic + real, doubtful records dropped (DU-54) | 1.230 | 0.694 |

- **On held-out real COVID data, the library's stated rows still beat every fine-tune, so the defaults stay.** Nothing in the config changed.
- Real training data helped where the real data looks like the test data and hurt where it doesn't: the cell-line fork improved from 1.453 to 0.099, and the forks a model may fill got worse, from 0.591 to 1.095. On airway and pasilla the direction diagnostics answer "unclear" in all 255 cases, and the model carried that to COVID, where they work.
- One held-out dataset, planted faults only.

On the Task 9 suite's real-count cases (DU-31, `eval/results/task9_calibration.md`), the stated rows also had the lowest held-out log loss: 0.5948, against 0.8414 for sampled gpt-4.1-mini and 0.7106 for Jev, on 45 matched test records.

**Cost** (estimated from tokens at list prices). DU-29: $5.37 on Tinker (training $3.01, base-model scoring $1.18, fine-tune scoring $1.18) and $1.05 on OpenAI (`eval/results/predictor_calibration.md`). DU-54: Tinker scoring $5.29, training the first new model $4.64 and training the second $3.00 (`eval/results/predictor_real_data.md`).

**In a run.** `predictor="tinker"` with `CRUX_TINKER_PREDICTOR` set to the sampler path swaps it in, with the sampled predictor as the fallback (`labs/bixbench3/swarm_lab.py`, `build_task9_run`). By default it keeps the library's stated rows and fills only options the library does not cover. There is no CLI preset for it. Its effect on a graded Task 9 score: not measured.

## Not measured

- Modal's own spend, total sandbox hours and median sandbox startup.
- The effect of search or shared memory on scores (one labelled run each, no comparison), and search hit rate across runs.
- The role-only memory comparison (`--config crux_role_only_memory`): built, not run.
- The Tinker predictor's effect on a graded Task 9 score.
- Possible model memorisation of the public source study.
- Any BixBench3 task other than task 9.
