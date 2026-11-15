"""Claim 2: null false-positive rate of the Wald test with per-gene dispersion estimates.

Simulates 20,000 genes with no differential expression, 3 vs 3 samples, NB counts with
gene means log-uniform on [10, 1000] and true dispersions on a trend 0.05 + 1/mu with
log-normal scatter (sd 0.3). Each gene's dispersion is estimated from its own six counts
(method of moments, floored at 1e-8) and plugged into the Wald test on the log fold change.
Reports the fraction of genes with p < 0.05.
"""

import numpy as np
from _common import (
    ALPHA,
    N_GENES,
    N_PER_GROUP,
    emit,
    mom_dispersion,
    null_counts,
    wald_pvalues,
)

SEED = 9001

rng = np.random.default_rng(SEED)
mu, alpha, a, b = null_counts(rng)
raw, per_gene = mom_dispersion(a, b)
p = wald_pvalues(a, b, per_gene)
fpr = float(np.mean(p < ALPHA))
print(f"{N_GENES} null genes, {N_PER_GROUP} vs {N_PER_GROUP} samples")
print(f"true dispersion: median {np.median(alpha):.4f}")
print(f"per-gene estimate: median {np.median(per_gene):.4f}, {np.mean(raw <= 0):.1%} at the floor")
print(f"false positives at p < {ALPHA}: {fpr:.4f}")

emit(
    {
        "fpr": round(fpr, 6),
        "fpr_se": round(float(np.sqrt(fpr * (1 - fpr) / N_GENES)), 6),
        "frac_dispersion_at_floor": round(float(np.mean(raw <= 0)), 6),
        "n_genes": N_GENES,
        "n_per_group": N_PER_GROUP,
        "seed": SEED,
    }
)
