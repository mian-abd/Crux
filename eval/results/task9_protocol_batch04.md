# Task 9 batch-04 protocol: a fresh held-out suite (DU-55)

Written and pushed **before** batch-04 ran. It keeps everything in `task9_protocol_batch03.md` except what's listed here.

## Why

By the end of batch-03, the seed-43 suite's cases had been run and graded twice. The clean-case fix (PR #47) was also written after seeing clean-case grades. A claim about cases nobody has looked at needs new cases, so batch-04 runs both arms once on a suite made fresh for it.

## The suite

- `eval.suites.task9.make_cases --seed 44`, from the same published counts and sample sheet: the clean case plus 2 each of the same six fault types.
- The fault instances are new: different affected samples, and a different case order. Sample IDs are shuffled per seed, so no bundle overlaps with the seed-43 suite (0 of 13), the clean case included.
- **Case names:** `h44-case-01` … `h44-case-13`. The clean case is `h44-case-12`.
- **Truth key:** evaluator-only, on the `crux-evaluator` volume at `task9-suite-h44/truth.json`. No one looked at results on these cases before this protocol was pushed.
- The staged inputs carry the same `gencode.v38` symbol map as batches 02 and 03.

## Runs

| Set | Cases | Arms | Repeats | Runs |
| --- | --- | --- | --- | --- |
| `batch-04-suite` | the 13 seed-44 cases | swarm, single agent (gpt-5.5) | 1 | 26 |

- **Cap:** $45 for the launch, in Modal, with the same per-run $2 and 40-call caps.
- **Tools:** Exa and past.dev are stripped from both arms.
- **Code:** the code is batch-03's plus PR #54 (a malformed merge plan keeps proposals unmerged instead of crashing). PR #55 changed no defaults; the later PRs touched only the site.
- Fault handling is scored with the batch-02 rubric by the same judge, against the seed-44 truth key.

## Measurement

- As in batch-03: per-case scores, means over the 12 fault cases and all 13, paired differences with 95% bootstrap intervals, faults caught, cost, calls and time. Failed runs count as 0.
- A run killed by a harness bug may be repeated once after the bug is fixed, and is reported only as a labelled deviation next to the pre-registered numbers.

## What we expect, stated in advance

1. **Fault handling:** the swarm catches at least 10 of the 12 faults, and more than the single agent.
2. **Score on the 12 fault cases:** no directional prediction. We report the paired interval as it falls.
3. **The clean case** (one run per arm): no prediction beyond batch-03's level (about 0.86 for both).
