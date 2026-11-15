# Task 9 batch-03 protocol: the clean-case fix, lessons on vs off, and random selection

Written and pushed **before** batch-03 ran. It extends `task9_protocol_batch02.md` and keeps everything there that isn't listed below. The same 13 cases, grader (Edison `d0e0bbb`), inputs (with the `gencode.v38` symbol map), prompt, $2 and 40-call cap per run, and Modal image apply.

## What changed since batch-02, and why

1. **Untested questions keep method defaults (PR #47).** The delivery planner used to apply the top option of every unresolved question. For a question no diagnostic tested, that order is only the proposers' prior. In batch-02 the untested low-count-filtering question was applied three different ways in the three clean swarm runs (0.790, 0.850, 0.861; the single agent scored 0.866–0.869 with DESeq2 defaults). Now an unresolved question that diagnostics tested still uses its best-supported option. An untested one keeps the method's documented defaults. **This rule was written after seeing clean-case grades, so clean-case scores count as tuned on task 9.**
2. **The predictor makes one joint call when sampling would pass 8 calls (PR #38).** This changes how the swarm scores proposer questions with many options.
3. **The single agent survives a reply cut off by its output cap (PR #40).** In batch-02 four of its runs crashed on this.
4. **Every run gets its own LLM response cache.** In batch-02 the cache was shared, so runs with identical prompts could replay each other's answers. Repeats are now independent.
5. **Everything runs in Modal:** orchestration, sandboxes and grading. The reference artifacts and the suite truth sit on an evaluator-only volume that the agents' sandboxes never mount.
6. **A reviewed lesson set for the lessons arm.** Six lessons drafted from the four dev cases' own runs (05, 06, 09, 12) were approved by Mian, and a seventh was rejected (`eval/lessons/task9-dev-candidates.json`). They're frozen as `eval/lessons/frozen/lessons-89a5141864a769e087311e42b101fb061dedd634d2a81ecdcb2f204ffe740f5e.json`, with the nine non-dev cases declared as held out. The reviewer had seen batch-02's test-case results; each approval rests on the dev evidence cited in the lesson.

## Runs, in launch order

| Set | Cases | Arm(s) | Repeats | Runs |
| --- | --- | --- | --- | --- |
| `batch-03-suite` | all 13 | swarm, single agent | 1 | 26 |
| `batch-03-clean` | clean (`task9-clean-v38.json`) | swarm, single agent | 2 | 4 |
| `batch-03-lessons` | the 9 test cases (01, 02, 03, 04, 07, 08, 10, 11, 13) | swarm with the frozen lessons | 1 | 9 |
| `batch-03-random` | all 13 | swarm with random experiment selection | 1 | 13 |

- **Spending cap:** $100 for the whole launch. A run is started only if its $2 maximum still fits under the cap. Runs not started because of the cap are listed as "not run: budget", never dropped.
- **Lessons off** is the `batch-03-suite` swarm arm on the same 9 test cases: same commit, models, inputs, seed and budget. Only the lesson block in the prompts differs.
- Exa and past.dev stay stripped from every arm.

## Measurement

- **Grade:** as in batch-02. A fault case is graded against the clean study's answers. Failed runs count as 0. Nothing is rerun to get a better number.
- **Fault handling:** the batch-02 rubric (caught / noticed only / missed), scored by the same judge from each run's METHODS.md, plus whether the swarm's matching library question settled on the fault.
- **Reported:**
  - per-case scores for every arm;
  - each arm's mean over the clean case (3 runs: the suite's case-05 plus 2 clean repeats), the 12 fault cases and all 13;
  - paired differences with 95% bootstrap intervals (10,000 resamples, seed 0);
  - faults caught;
  - cost, model calls and wall time.

## What we expect, stated in advance

1. **The clean-case gap closes:** the swarm's clean mean over 3 runs is within 0.01 of the single agent's.
2. **Fault handling holds:** the swarm catches at least 10 of the 12 faults, and more than the single agent.
3. **Score on the 12 fault cases:** no directional prediction. We report the paired interval as it falls.
4. **Lessons:** with 9 cases we don't expect a significant score change. We report on-minus-off per case, and whatever it shows.
5. **Random selection:** if information-gain selection matters, the random arm catches fewer faults or spends more to catch them. We report it either way.
