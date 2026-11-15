"""Claim 3: false discovery rate of Benjamini-Hochberg on independent tests.

2,000 simulated experiments, each with m = 1,000 independent one-sided z-tests: 900 true
nulls (z ~ N(0, 1)) and 100 alternatives (z ~ N(3, 1)), p = 1 - Phi(z). BH at q = 0.05 in
every experiment; FDR = mean of V / max(R, 1). Theory for independent tests: FDR = pi0 * q
= 0.045.
"""

import numpy as np
from _common import ALPHA, bh_experiment, emit

SEED = 3101
M, M0, EFFECT, REPS = 1000, 900, 3.0, 2000

rng = np.random.default_rng(SEED)
false_rej, rej = bh_experiment(rng, M, M0, EFFECT, REPS)
fdp = false_rej / np.maximum(rej, 1)
fdr = float(fdp.mean())
se = float(fdp.std(ddof=1) / np.sqrt(REPS))
print(f"{REPS} experiments x {M} tests, pi0 = {M0 / M}, effect {EFFECT}, BH at q = {ALPHA}")
print(f"mean rejections {rej.mean():.1f}, mean false rejections {false_rej.mean():.2f}")
print(f"FDR = {fdr:.4f} (se {se:.4f}); pi0*q = {M0 / M * ALPHA:.4f}")

emit(
    {
        "fdr": round(fdr, 6),
        "fdr_se": round(se, 6),
        "pi0": M0 / M,
        "m": M,
        "reps": REPS,
        "mean_rejections": round(float(rej.mean()), 3),
        "seed": SEED,
    }
)
