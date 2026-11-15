"""Claim 4: family-wise error rate of Benjamini-Hochberg on independent tests.

The same simulation as the FDR diagnostic, with its own seed: 2,000 experiments, each
with m = 1,000 independent one-sided z-tests (900 true nulls, 100 alternatives with
z ~ N(3, 1)), BH at q = 0.05. FWER = fraction of experiments with at least one false
rejection.
"""

import numpy as np
from _common import ALPHA, bh_experiment, emit

SEED = 4101
M, M0, EFFECT, REPS = 1000, 900, 3.0, 2000

rng = np.random.default_rng(SEED)
false_rej, rej = bh_experiment(rng, M, M0, EFFECT, REPS)
fwer = float(np.mean(false_rej >= 1))
fdr = float((false_rej / np.maximum(rej, 1)).mean())
print(f"{REPS} experiments x {M} tests, pi0 = {M0 / M}, effect {EFFECT}, BH at q = {ALPHA}")
print(f"mean false rejections {false_rej.mean():.2f}; FWER = {fwer:.4f}; FDR = {fdr:.4f}")

emit(
    {
        "fwer": round(fwer, 6),
        "fdr": round(fdr, 6),
        "mean_false_rejections": round(float(false_rej.mean()), 3),
        "pi0": M0 / M,
        "m": M,
        "reps": REPS,
        "seed": SEED,
    }
)
