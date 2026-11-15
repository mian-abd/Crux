# Claims lab (MVP): auditing claims from a paper

The claims lab points the Crux engine at mathematical and statistical claims instead of a data
set. **It is an MVP on a hand-curated set of four claims** from one paper: Love, Huber & Anders
(2014), "Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2",
*Genome Biology* 15:550, [doi:10.1186/s13059-014-0550-8](https://doi.org/10.1186/s13059-014-0550-8)
(open access, CC BY 4.0). Claims are paraphrased; the only source text in the lab is our short
paraphrase of the Methods (`labs/claims/source.py`).

Everything runs for real: SymPy does the symbolic algebra, numpy and scipy run the simulations,
and the unchanged orchestrator runs the loop (EIG per cost, referee, Bayes update, rejection,
settling, "none of these"). No model is called and no API key is needed. A run takes about 10 s.

## The four claims

| Question id | Claim (paraphrased) | Kind | Options (`answer_key`) | Diagnostics |
| --- | --- | --- | --- | --- |
| `claim-nb-variance` | A negative binomial count with mean μ and dispersion α has variance μ + αμ². | symbolic | `holds`; `alt_param` (variance μ + μ²/α, the size/dispersion mix-up) | `nb_variance_symbolic` (exact, ~3 s), `nb_variance_montecarlo` (noisy, ~1 s) |
| `claim-wald-calibration` | With 3 replicates per group, Wald-test p-values from the NB GLM are calibrated under the null. | statistical | `holds`; `holds_if` (only with moderated or known dispersion); `fails_conservative` | `wald_pergene`, `wald_known`, `wald_pergene_vs_moderated` |
| `claim-bh-fdr` | Benjamini–Hochberg adjusted p-values below α control the FDR at α (independent tests). | statistical | `holds`; `fails` | `bh_fdr_sim`, `bh_fdr_sweep` |
| `claim-bh-fwer` | Benjamini–Hochberg adjustment controls the FWER at α. **Planted false claim**: the paper does not make it. | statistical | `holds`; `fails` | `bh_fwer_sim`, `bh_fwer_counterexample` (cheap search) |

What the diagnostics compute (each is one script in `labs/claims/scripts/`, fixed seed, one
`RESULT:` line):

* `nb_variance_symbolic`: sums the NB pmf (size r = 1/α) into its generating function, checks
  convergence at s = 1, G(1) = 1 and mean μ, takes the variance from G' and G'', cross-checks it
  against the gamma-Poisson mixture by symbolic integration, then compares it exactly
  (`simplify(difference) == 0`) with μ + αμ² and μ + μ²/α. It also reports the largest exact
  residual of each formula on nine rational (μ, α) points, the number its bin rules lead with.
* `nb_variance_montecarlo`: 200,000 NB draws at four (μ, α) settings; largest relative error of
  the sample variance against each formula (bins at 5%).
* `wald_*`: 20,000 simulated null genes, 3 vs 3, NB counts with means log-uniform on [10, 1000]
  and true dispersion 0.05 + 1/μ with log-normal scatter (sd 0.3). The Wald test is our own: z is
  log(mean_B / mean_A) over the delta-method standard error sqrt((1/mean_A + α)/3 +
  (1/mean_B + α)/3), compared with the standard normal. It is not DESeq2 (no IRLS fit, equal
  size factors, no covariates). The dispersion plugged in is per-gene method of moments
  (`wald_pergene`), the true value (`wald_known`), or both per-gene and moderated on the same
  data (`wald_pergene_vs_moderated`), where moderated means a trend a0 + a1/mean fitted across
  all genes by least squares, each gene taking the trend value (full shrinkage, not DESeq2's
  empirical Bayes MAP). Bins on the false-positive rate at p < 0.05: below 0.04, 0.04 to 0.065,
  above 0.065.
* `bh_fdr_sim` / `bh_fwer_sim`: 2,000 experiments of 1,000 independent one-sided z-tests (900
  nulls, 100 alternatives at effect 3), BH at q = 0.05; FDR = mean V/max(R, 1), FWER = share of
  experiments with any false rejection.
* `bh_fdr_sweep`: nine settings (m = 10, 100, 1,000; π0 = 0.5, 0.8, 1); largest z-score of the
  simulated FDR above π0·q and above q (bins at 4 standard errors).
* `bh_fwer_counterexample`: walks m = 2 to 8 and m0 = 1 to m - 1 nulls (other tests strong
  signals), 200,000 experiments each, and stops at the first setting whose 99.9% lower bound on
  the FWER is above 0.055.

## How a run works

The lab and its roles are in `labs/claims/` (`lab.py`, `agents.py`, `library.py`, `report.py`,
`source.py`):

1. `run.started`, then one `claims.source` event (the paper, the paraphrased excerpt and the
   claims; see `docs/EVENTS.md`), then `profile.done` with the paper's metadata as evidence.
2. `propose` returns the four curated questions and their options; the orchestrator adds
   "none of these" (`<question_id>.h0`).
3. For the open question with the most impact × entropy, `design` returns its pre-registered
   diagnostics. The predictor is the existing `SampledPredictor`: every option has a row in
   each diagnostic's `design["stated"]` table, so it uses those library rows and never asks a
   model. The orchestrator ranks the diagnostics by EIG per cost and runs the best one.
4. `ClaimsLab.run` writes the diagnostic's code to `runs/<id>/work/`, runs it with this
   Python in a subprocess (120 s timeout), saves the output to `runs/<id>/logs/<diagnostic>.log`
   (streamed as `experiment.log`), parses the single `RESULT:` line and picks the one bin whose
   rule holds. The local subprocess is not a sandbox; it only runs the library's scripts.
5. The referee is a deterministic, blind code referee (`labs/claims/agents.py:code_referee`): the
   LLM referee's own code checks, then exactly one `RESULT:` line in the log equal to the
   recorded result, every key the bin rules read present and finite, and exactly one bin rule
   holding. The LLM referee is not used, because its prompt asks whether a result is "derived
   from the data", which does not fit self-contained simulations and derivations, and a code
   referee keeps the demo free and reproducible.
6. Bayes update; options under 0.02 are rejected with the evidence that rejected them; a
   question settles at 0.9 and ends unresolved when no remaining diagnostic is worth 0.05 bits.
7. `deliver` writes `CLAIMS.md`: per claim the verdict (holds / refuted / holds only under a
   condition / unresolved), the deciding diagnostics with their numbers, the rejected options
   with their evidence, and the limits. A claim whose own option (`holds`) was rejected is
   reported as refuted even if the engine could not settle which alternative is true.

## The recorded run

`runs/demo/claims_deseq2.jsonl` (with the run's `CLAIMS.md` and manifest in
`runs/demo/claims-deseq2-20261114/`):

| Claim | Engine outcome | Deciding numbers |
| --- | --- | --- |
| NB variance | settled `holds` (0.956); `alt_param` rejected | SymPy: variance = μ(αμ + 1), equal to μ + αμ², not μ + μ²/α; Monte Carlo: largest relative error 0.0044 against μ + αμ², 2.14 against μ + μ²/α |
| Wald calibration | settled `holds_if` (0.941); `holds` and `fails_conservative` rejected | FPR 0.1139 with per-gene dispersion against 0.05755 with moderated dispersion on the same data; FPR 0.114 again in a separate per-gene run |
| BH controls FDR | settled `holds` (0.951); `fails` rejected | no setting of nine above π0·q (largest excess 2.4 standard errors); FDR 0.0450 at π0 = 0.9 (theory 0.045) |
| BH controls FWER (planted) | `holds` rejected (0.017), so the claim is refuted; the question ended unresolved with `fails` at 0.877 | counterexample: m = 3 tests, 2 nulls and 1 strong signal give FWER 0.0659 (99.9% lower bound 0.0641) |

On the planted claim the cheap counterexample search ran first (it had the higher EIG) and on
its own pushed `holds` below the rejection bar. That left `fails` against "none of these", and
the remaining FWER simulation was worth only 0.047 bits between them, under the 0.05 floor,
because the stated row for `fails` there is diffuse (0.70 on "far above α"). So the engine
stopped without settling `fails`. We report that rather than changing the pre-registered row
after the fact.

## What the MVP does not do

* **Claim extraction from arbitrary papers is not implemented.** The four claims, their options,
  their diagnostics and the stated rows were written by hand and pre-registered.
* **No formal proofs.** The symbolic diagnostic is a computer-algebra derivation, not a checked
  proof; simulations are evidence at the settings they try.
* The Wald test and the moderated dispersion are simplified stand-ins (described above), not
  DESeq2 itself. Dependent tests, low counts and other dispersion patterns are not simulated.
* No LLM roles: proposer, designer, referee, critic and reporter are deterministic code.

## Running it

```sh
uv run python -m core.cli --lab claims --run-id claims-demo
uv run python -m core.replay runs/claims-demo/events.jsonl
uv run python -m core.replay runs/demo/claims_deseq2.jsonl
uv run python -m pytest -q tests/test_claims_lab.py
```

The run writes `runs/<id>/events.jsonl`, `artifacts/CLAIMS.md`, `logs/` (each diagnostic's
output), `work/` (the scripts as run) and `manifest.json`. `--fake-clock` makes event timestamps
deterministic; the results are deterministic anyway (fixed seeds).

## Showing it in the UI

Start the API (`uv run uvicorn api.server:app`). It serves every `runs/demo/*.jsonl` as a replay:
`GET /replays` lists `claims_deseq2.jsonl` and `GET /replays/claims_deseq2/events?speed=1`
streams it as server-sent events. A live run starts with `POST /runs` and
`{"lab": "claims"}` (registered in `api/launcher.py`); follow it at `GET /runs/<run_id>/events`.
The source panel reads the `claims.source` event (seq 1): `quote` is the passage to highlight in
`excerpt`, and `planted` marks the planted claim for display after the fact (no agent reads it).
Verdict colours can key on the options' `answer_key` (`holds`, `fails`, `holds_if`, `alt_param`,
`fails_conservative`). Every bin rule names its headline numeric statistic first (for example
`fpr > 0.065`, `fdr <= 0.0475`, `fwer > 0.055 and fwer_lower > 0.055 and found`), so a card's key
number is the first numeric result field in the observed bin's rule.

## Adding a claim

1. Write its diagnostics as scripts in `labs/claims/scripts/` that import their helpers from
   `_common.py` (inlined before running), use a fixed seed and print exactly one
   `RESULT: {json}` line with flat values.
2. Add a `Claim` to `CLAIMS` in `labs/claims/library.py`: the question id, claim text, question,
   kind, impact, options (each `answer_key` from `ANSWER_KEYS`), and for each diagnostic its bins
   (exhaustive, mutually exclusive rules over the `RESULT` keys), a `stated` row for every option,
   an estimated cost in seconds and the summary keys to quote. Start each rule with its headline
   numeric statistic (`fpr > 0.065`, `fwer > 0.1`) and keep that field in the `RESULT` payload:
   the UI's key number is the first numeric field named in the observed bin's rule. Write the
   stated rows before the first run.
3. Add its entry to `SOURCE` in `labs/claims/source.py` (a quote from `EXCERPT`, or `""`, and
   whether it is planted).
4. Add each diagnostic's expected bin to `EXPECTED_BIN` in `tests/test_claims_lab.py` and run the
   tests: they check the bins, the rows, that every script runs and lands in its bin, and the
   full run.
