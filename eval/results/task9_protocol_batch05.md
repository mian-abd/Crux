# Task 9 batch-05 protocol: three more fresh held-out suites

Written and pushed **before** batch-05 ran. It keeps everything in `task9_protocol_batch04.md` except what's listed here.

## Why

Batch-04 was the first result on cases nobody had run, graded or tuned on: 13 cases, one run per arm per case, paired difference +0.203 (95% CI +0.048 to +0.382). One suite of 13 is a small sample. Batch-05 runs the same comparison on three more suites made fresh for it, so the held-out result rests on 52 cases instead of 13.

## The suites

- `eval.suites.task9.make_cases --seed 45`, `--seed 46` and `--seed 47`, from the same published counts and sample sheet: in each, the clean case plus 2 each of the same six fault types.
- The fault instances are new. No staged bundle overlaps the seed-43 or seed-44 suites, or another batch-05 suite (0 of 39).
- **Case names:** `h45-case-01` … `h45-case-13`, `h46-…` and `h47-…`. The clean cases are `h45-case-10`, `h46-case-04` and `h47-case-08`.
- **Truth keys:** evaluator-only, on the `crux-evaluator` volume at `task9-suite-h45/truth.json`, `task9-suite-h46/truth.json` and `task9-suite-h47/truth.json`. No one has run or looked at results on these cases before this protocol was pushed.
- The staged inputs carry the same `gencode.v38` symbol map as batches 02 to 04.

## Runs

| Launch | Cases | Arms | Repeats | Runs | Cap |
| --- | --- | --- | --- | --- | --- |
| `batch-05-h45` | the 13 seed-45 cases | swarm, single agent (gpt-5.5) | 1 | 26 | $45 |
| `batch-05-h46` | the 13 seed-46 cases | swarm, single agent (gpt-5.5) | 1 | 26 | $45 |
| `batch-05-h47` | the 13 seed-47 cases | swarm, single agent (gpt-5.5) | 1 | 26 | $45 |

- **Three Modal launches at the same time**, each with its own orchestrator container, results folder and $45 cap, and up to 13 runs at a time per launch. The same per-run $2 and 40-call caps apply.
- **Tools:** Exa and past.dev are stripped from both arms.
- **Code:** batch-04's engine and baseline. Since batch-04 the only engine-side change is in the launcher: `eval/cloud_jobs.py` accepts the new suite names and finds each suite's truth file. Every other change since batch-04's commit `95aaa11` touched the site, the run viewer, deployment files (`Dockerfile.api`) or documentation.
- Fault handling is scored with the batch-02 rubric by the same judge, against each suite's own truth key.

## Measurement

- **Per suite**, as in batch-04: per-case scores, means over the 12 fault cases and all 13, paired differences with 95% bootstrap intervals, faults caught, cost, calls and time. Failed runs count as 0.
- **Combined held-out result:** the same measures over all 52 held-out cases (seed 44 from batch-04 plus seeds 45 to 47), with the bootstrap resampling cases. This combined number becomes the headline, whatever it shows.
- A run killed by a harness bug may be repeated once after the bug is fixed, and is reported only as a labelled deviation next to the pre-registered numbers.
- A launch that cannot finish before the submission deadline is reported as incomplete, with the runs that finished; unfinished runs are listed and not imputed.

## What we expect, stated in advance

1. **Fault handling:** in each suite the swarm catches at least 10 of the 12 faults, and more than the single agent.
2. **Score:** no directional prediction for any single suite. On the 52 combined cases we report the paired interval as it falls; batch-04's +0.203 may shrink.
3. **The clean cases** (one run per arm per suite): no prediction beyond batch-03's level (about 0.86 for both).
