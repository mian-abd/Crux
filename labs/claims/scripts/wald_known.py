"""Claim 2: null false-positive rate of the Wald test when the dispersion is known.

The same simulation design as the per-gene diagnostic (20,000 null genes, 3 vs 3, NB
counts, dispersion trend 0.05 + 1/mu with log-normal scatter sd 0.3), with a different
seed. The Wald test on the log fold change uses each gene's true dispersion. Reports the
fraction of genes with p < 0.05.
"""

import numpy as np
from _common import ALPHA, N_GENES, N_PER_GROUP, emit, null_counts, wald_pvalues

SEED = 9002

rng = np.random.default_rng(SEED)
mu, alpha, a, b = null_counts(rng)
p = wald_pvalues(a, b, alpha)
fpr = float(np.mean(p < ALPHA))
print(f"{N_GENES} null genes, {N_PER_GROUP} vs {N_PER_GROUP} samples, true dispersion used")
print(f"true dispersion: median {np.median(alpha):.4f}")
print(f"false positives at p < {ALPHA}: {fpr:.4f}")

emit(
    {
        "fpr": round(fpr, 6),
        "fpr_se": round(float(np.sqrt(fpr * (1 - fpr) / N_GENES)), 6),
        "n_genes": N_GENES,
        "n_per_group": N_PER_GROUP,
        "seed": SEED,
    }
)
