"""Claim 3: search a grid of settings for one where BH's FDR exceeds its bound.

Independent one-sided z-tests (alternatives z ~ N(2.5, 1)) at nine settings: m in
{10, 100, 1000} x pi0 in {0.5, 0.8, 1.0}, BH at q = 0.05. For each setting the FDR is
estimated by simulation with its standard error, then compared with the theoretical value
pi0 * q (z-score of the excess) and with q itself. Reports the largest z-scores.
"""

import numpy as np
from _common import ALPHA, bh_experiment, emit

SEED = 3202
EFFECT = 2.5
REPS = {10: 20_000, 100: 5_000, 1000: 1_000}

rng = np.random.default_rng(SEED)
worst_bound, worst_alpha, worst = -np.inf, -np.inf, ""
for m, reps in REPS.items():
    for pi0 in (0.5, 0.8, 1.0):
        m0 = round(pi0 * m)
        false_rej, rej = bh_experiment(rng, m, m0, EFFECT, reps)
        fdp = false_rej / np.maximum(rej, 1)
        fdr = float(fdp.mean())
        se = max(float(fdp.std(ddof=1) / np.sqrt(reps)), 1e-9)
        z_bound = (fdr - pi0 * ALPHA) / se
        z_alpha = (fdr - ALPHA) / se
        print(
            f"m={m:<5} pi0={pi0:.1f}: FDR {fdr:.4f} (se {se:.4f}), pi0*q {pi0 * ALPHA:.4f}, "
            f"excess z {z_bound:+.2f}"
        )
        if z_bound > worst_bound:
            worst_bound, worst = z_bound, f"m={m}, pi0={pi0:.1f}"
        worst_alpha = max(worst_alpha, z_alpha)

emit(
    {
        "max_excess_z": round(float(worst_bound), 4),
        "max_alpha_z": round(float(worst_alpha), 4),
        "worst_setting": worst,
        "n_settings": len(REPS) * 3,
        "seed": SEED,
    }
)
