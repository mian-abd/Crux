# Claims audit: DESeq2 (Love, Huber & Anders 2014)

MVP on a hand-curated set of four claims. Each claim was audited by the Crux engine with pre-registered symbolic or simulation diagnostics, chosen by expected information gain per cost, checked by a blind code referee and combined by Bayes' rule. Verdicts: holds, refuted, holds only under a condition, or unresolved.

Source: [Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2](https://doi.org/10.1186/s13059-014-0550-8), Love, Huber & Anders (2014) Genome Biology 15:550, CC BY 4.0. Claim texts are paraphrased.

| Claim | Verdict | Posterior | Diagnostics run |
|---|---|---|---|
| 1. Negative binomial variance | holds | 0.956 | 2 |
| 2. Wald test calibration with 3 replicates | holds only under a condition | 0.941 | 2 |
| 3. Benjamini-Hochberg controls the FDR | holds | 0.951 | 2 |
| 4. Benjamini-Hochberg controls the FWER | refuted | `holds` rejected | 1 |

## 1. Negative binomial variance (`claim-nb-variance`)

> A negative binomial count with mean μ and dispersion α has variance μ + αμ².

Source passage (our paraphrase of the Methods): "the variance is μij + αi·μij²"
Kind: symbolic

**Verdict:** holds. Accepted option (`holds`): "Yes: the variance is μ + αμ²." Posterior 0.956 (settled after 2 diagnostics); 'none of these' 0.044.

### Deciding diagnostics

| # | Diagnostic | Observed | Key numbers |
|---|---|---|---|
| 1 | `nb_variance_symbolic`: Derive the NB variance exactly with SymPy: sum the pmf (size 1/α) into its generating function, differentiate, cross-check with the gamma-Poisson mixture, and compare with μ + αμ² and μ + μ²/α | `alpha_form` (the derived variance is exactly μ + αμ²) | variance = mu*(alpha*mu + 1), max_abs_residual_alpha_form = 0, max_abs_residual_inv_alpha_form = 31920, mixture_agrees = yes |
| 2 | `nb_variance_montecarlo`: Draw 200,000 NB counts at four (μ, α) settings and compare the sample variance with μ + αμ² and with μ + μ²/α (relative error 5%) | `alpha_form` (within 5% of μ + αμ² at every setting) | max_rel_err_alpha_form = 0.004392, max_rel_err_inv_alpha_form = 2.136, n_draws = 200000 |

### Rejected options

- `alt_param`: "No: the variance is μ + μ²/α." Rejected: posterior 0.0062 fell below 0.02 after nb_variance_symbolic observed 'alpha_form'. Evidence: `nb_variance_symbolic` observed `alpha_form` (the derived variance is exactly μ + αμ²); variance = mu*(alpha*mu + 1), max_abs_residual_alpha_form = 0, max_abs_residual_inv_alpha_form = 31920, mixture_agrees = yes.

### Limits

- The claim is checked under the size parametrisation r = 1/α that DESeq2 uses; under another parametrisation the symbol α means something else.
- The Monte Carlo check covers four (μ, α) settings; the symbolic derivation covers all positive μ and α.

## 2. Wald test calibration with 3 replicates (`claim-wald-calibration`)

> With 3 replicates per group, Wald-test p-values from the negative binomial GLM are calibrated under the null.

Source passage (our paraphrase of the Methods): "Log fold changes are tested with a Wald test"
Kind: statistical

**Verdict:** holds only under a condition. Accepted option (`holds_if`): "Calibrated only when the dispersion is moderated (shared across genes) or known; with per-gene estimates the test is anti-conservative." Posterior 0.941 (settled after 2 diagnostics); 'none of these' 0.059.

### Deciding diagnostics

| # | Diagnostic | Observed | Key numbers |
|---|---|---|---|
| 1 | `wald_pergene_vs_moderated`: On the same 20,000 simulated null genes (3 vs 3, NB), compare the Wald test's false-positive rate with per-gene dispersion and with moderated dispersion (a mean-dispersion trend fitted across genes) | `gap_closes` (per-gene FPR above 0.065 and moderated FPR in [0.04, 0.065]) | fpr_pergene = 0.1139, fpr_moderated = 0.05755, trend_a0 = 0.05323, trend_a1 = 0.8517 |
| 2 | `wald_pergene`: Simulate 20,000 null genes (3 vs 3, NB) and measure the Wald test's false-positive rate at p < 0.05 with per-gene method-of-moments dispersion | `anti_conservative` (per-gene dispersion: FPR above 0.065) | fpr = 0.114, fpr_se = 0.002247, frac_dispersion_at_floor = 0.06525 |

### Rejected options

- `holds`: "Calibrated, whichever dispersion estimate is plugged in." Rejected: posterior 0.0115 fell below 0.02 after wald_pergene observed 'anti_conservative'. Evidence: `wald_pergene` observed `anti_conservative` (per-gene dispersion: FPR above 0.065); fpr = 0.114, fpr_se = 0.002247, frac_dispersion_at_floor = 0.06525.
- `fails_conservative`: "Conservative: fewer than 5% of null genes reach p < 0.05." Rejected: posterior 0.0012 fell below 0.02 after wald_pergene observed 'anti_conservative'. Evidence: `wald_pergene` observed `anti_conservative` (per-gene dispersion: FPR above 0.065); fpr = 0.114, fpr_se = 0.002247, frac_dispersion_at_floor = 0.06525.

### Limits

- The Wald test here is a hand-written test on the log ratio of group means with a delta-method standard error (equal size factors, no covariates), not DESeq2's IRLS fit; the moderated dispersion is full shrinkage to a fitted trend, not DESeq2's empirical Bayes MAP estimate.
- One simulation design: gene means log-uniform on [10, 1000], dispersion trend 0.05 + 1/μ with log-normal scatter (sd 0.3). Lower counts or other dispersion patterns were not tested.

## 3. Benjamini-Hochberg controls the FDR (`claim-bh-fdr`)

> Benjamini–Hochberg adjusted p-values below α control the false discovery rate at α (independent tests).

Source passage (our paraphrase of the Methods): "the Benjamini–Hochberg procedure, which controls the false discovery rate"
Kind: statistical

**Verdict:** holds. Accepted option (`holds`): "Yes: the FDR is at most α (π0·α for independent continuous tests)." Posterior 0.951 (settled after 2 diagnostics); 'none of these' 0.049.

### Deciding diagnostics

| # | Diagnostic | Observed | Key numbers |
|---|---|---|---|
| 1 | `bh_fdr_sweep`: Search nine settings (m = 10 to 1,000 independent tests, π0 = 0.5 to 1) for one where BH's simulated FDR exceeds π0·α or α by more than 4 standard errors | `none_above_bound` (no setting exceeds π0·α (or α) by more than 4 standard errors) | max_excess_z = 2.421, max_alpha_z = 0.8235, worst_setting = m=1000, pi0=0.5 |
| 2 | `bh_fdr_sim`: Simulate 2,000 experiments of 1,000 independent z-tests (90% true nulls) and measure BH's false discovery rate at q = 0.05 | `within_bound` (FDR at most π0·α + 0.0025 = 0.0475) | fdr = 0.04499, fdr_se = 0.000581, pi0 = 0.9, mean_rejections = 63.65 |

### Rejected options

- `fails`: "No: the FDR can exceed α even for independent tests." Rejected: posterior 0.0197 fell below 0.02 after bh_fdr_sim observed 'within_bound'. Evidence: `bh_fdr_sim` observed `within_bound` (FDR at most π0·α + 0.0025 = 0.0475); fdr = 0.04499, fdr_se = 0.000581, pi0 = 0.9, mean_rejections = 63.65.

### Limits

- Simulations check the guarantee at the settings tried; they are not a proof. The proof for independent tests is Benjamini and Hochberg (1995).
- Dependent tests (for example correlated genes) were not simulated.

## 4. Benjamini-Hochberg controls the FWER (`claim-bh-fwer`)

> Benjamini–Hochberg adjustment controls the family-wise error rate at α.

Source: planted. The paper does not make this claim; it was added as a known falsehood to test the audit. The agents were not told.
Kind: statistical

**Verdict:** refuted. The claim's own option (`holds`) was rejected by the evidence below. Which alternative is true stayed unresolved: `fails` 0.877; 'none of these' 0.123.
The engine stopped on this question: best expected information gain 0.047 bits is below 0.05 bits.

### Deciding diagnostics

| # | Diagnostic | Observed | Key numbers |
|---|---|---|---|
| 1 | `bh_fwer_counterexample`: Search the smallest settings (m = 2 to 8 tests, strong signals for the non-nulls) for one where BH's FWER clearly exceeds q = 0.05 (99.9% lower bound above 0.055) | `clear_counterexample` (a setting whose FWER lower bound is above 0.055) | m = 3, m0 = 2, fwer = 0.06591, fwer_lower = 0.06409, settings_tried = 3 |

### Rejected options

- `holds`: "Yes: the chance of at least one false rejection is at most α." Rejected: posterior 0.0169 fell below 0.02 after bh_fwer_counterexample observed 'clear_counterexample'. Evidence: `bh_fwer_counterexample` observed `clear_counterexample` (a setting whose FWER lower bound is above 0.055); m = 3, m0 = 2, fwer = 0.06591, fwer_lower = 0.06409, settings_tried = 3.

### Limits

- Under the global null (every test null) BH's FWER equals α, so the claim fails only when true signals are present, which is the usual case.

## What this MVP does not do

- This is an MVP on four hand-curated claims. Extracting claims from an arbitrary paper is not implemented: the claims, their options and their diagnostics were written by hand and pre-registered before the run.
- Simulation diagnostics are evidence at the settings they try, not proofs. The symbolic diagnostic is an exact computer-algebra derivation, not a checked formal proof.
- Each verdict is the engine's posterior over the curated options plus 'none of these'; an option outside that list can only show up as mass on 'none of these'.
