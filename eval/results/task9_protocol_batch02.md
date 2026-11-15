# Task 9 batch-02 protocol: clean case and 13-case fault suite, swarm vs single agent

Written and pushed **before** batch-02 ran. Code: this commit. It extends `task9_protocol.md` and keeps everything there that isn't listed below.

## What changed since batch-01, and why

1. **Gene annotation for both arms.** The bundle now includes `inputs_metadata.json` with `gene_symbol_by_gene_id`, built from the task's own official input `gencode.v38.annotation.gtf.gz` (Edison's inputs bucket). It matches 99.9% of the count matrix's versioned gene IDs exactly. Batch-01 had no annotation, so both shared-gene artifacts scored 0 by construction.
2. **Shared fallback prompt (from Jason, PR #30).** It adds explicit output formats (unversioned IDs, label vocabulary) and "one DESeq2 fit per cell line, `design = ~ condition`, every contrast extracted from that fit". That rule was written after seeing graded clean-case results, so **clean-case scores from now on count as tuned on task 9.** The 12 fault cases have never been run or graded by either arm.
3. **Identical tools.** Web search (Exa) and shared memory (past.dev) are stripped from both arms' environments. They get separate, labelled runs later.

## Runs

| Set | Cases | Arms | Repeats | Runs |
| --- | --- | --- | --- | --- |
| `batch-02-suite` | 13: 1 clean plus 2 each of sample swap, label inversion, duplicate library, low depth, cell-line swap and gene version (`make_cases`, seed 43) | swarm, baseline | 1 | 26 |
| `batch-02-clean` | clean only (bundle `ca6c72f0…`) | swarm, baseline | 2 | 4 |

- At most 8 runs at a time, so rate limits don't fail runs. Each run gets its own Modal sandbox, a $2 and 40-call cap, and the same inputs, prompt and grader.
- The baseline is gpt-5.5 throughout. The swarm uses gpt-4.1-mini for its cheap roles and gpt-5.5 for the strong ones, as in batch-01.

## Measurement

- **Grade:** Edison's grader at `d0e0bbb` against the original study's references, for every case. A fault case is graded against the clean study's answers: the ideal run notices the fault and repairs or works around it.
- **Fault caught:** scored afterwards from the evaluator-only truth key. For the swarm, did the matching library question settle on the fault option? For both arms, does METHODS.md name the fault and act on it? The rubric below is fixed now.
  - **Caught:** the fault is named, and the delivered analysis handles it (relabelled, excluded or fixed).
  - **Noticed only:** the fault is named, but the analysis doesn't change.
  - **Missed:** the fault isn't named.
- **Reported:** the per-case score for both arms, the paired difference per case, each arm's mean over the 12 fault cases and over all 13, the clean-case mean over 3 runs per arm, cost and calls. Failed runs count as 0. Nothing is rerun to get a better number.
