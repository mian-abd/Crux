"""Claim 2: per-gene against moderated dispersion on the same simulated null data.

The same simulation design (20,000 null genes, 3 vs 3, NB counts, dispersion trend
0.05 + 1/mu with log-normal scatter sd 0.3), with its own seed. Two Wald tests on the log
fold change of the same counts: one with per-gene method-of-moments dispersions, one with
moderated dispersions (a trend a0 + a1/mean fitted across all genes by least squares, each
gene taking the trend value at its mean). Reports both false-positive rates at p < 0.05.
"""

import numpy as np
from _common import (
    ALPHA,
    N_GENES,
    N_PER_GROUP,
    emit,
    mom_dispersion,
    null_counts,
    trend_dispersion,
    wald_pvalues,
)

SEED = 9003

rng = np.random.default_rng(SEED)
mu, alpha, a, b = null_counts(rng)
raw, per_gene = mom_dispersion(a, b)
moderated, coef = trend_dispersion(a, b, raw)
fpr_pergene = float(np.mean(wald_pvalues(a, b, per_gene) < ALPHA))
fpr_moderated = float(np.mean(wald_pvalues(a, b, moderated) < ALPHA))
print(f"{N_GENES} null genes, {N_PER_GROUP} vs {N_PER_GROUP} samples")
print(f"fitted trend: alpha(mean) = {coef[0]:.4f} + {coef[1]:.4f} / mean (truth 0.05 + 1/mu)")
print(f"false positives at p < {ALPHA}: per-gene {fpr_pergene:.4f}, moderated {fpr_moderated:.4f}")

emit(
    {
        "fpr_pergene": round(fpr_pergene, 6),
        "fpr_moderated": round(fpr_moderated, 6),
        "trend_a0": round(float(coef[0]), 6),
        "trend_a1": round(float(coef[1]), 6),
        "n_genes": N_GENES,
        "n_per_group": N_PER_GROUP,
        "seed": SEED,
    }
)
