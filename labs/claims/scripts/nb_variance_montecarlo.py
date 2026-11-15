"""Claim 1, cheap noisy check: NB sample variances against both candidate formulas.

Draws NB counts with mean mu and dispersion alpha (size r = 1/alpha, numpy's sampler) at
four (mu, alpha) settings where the two formulas differ by at least a factor of three, and
reports the largest relative error of the sample variance against mu + alpha*mu^2 and
against mu + mu^2/alpha.
"""

import numpy as np
from _common import emit, nb_counts

SEED = 2014
N_DRAWS = 200_000
SETTINGS = ((5.0, 2.0), (10.0, 0.5), (50.0, 0.1), (200.0, 0.02))

rng = np.random.default_rng(SEED)
err_alpha, err_inv = [], []
for mu, alpha in SETTINGS:
    y = nb_counts(rng, mu, alpha, size=N_DRAWS)
    var = float(y.var(ddof=1))
    alpha_form, inv_form = mu + alpha * mu**2, mu + mu**2 / alpha
    err_alpha.append(abs(var - alpha_form) / alpha_form)
    err_inv.append(abs(var - inv_form) / inv_form)
    print(
        f"mu={mu:g} alpha={alpha:g}: mean={y.mean():.3f} var={var:.2f} "
        f"| mu+alpha*mu^2={alpha_form:.2f} (rel err {err_alpha[-1]:.4f}) "
        f"| mu+mu^2/alpha={inv_form:.2f} (rel err {err_inv[-1]:.4f})"
    )

emit(
    {
        "max_rel_err_alpha_form": round(max(err_alpha), 6),
        "max_rel_err_inv_alpha_form": round(max(err_inv), 6),
        "n_settings": len(SETTINGS),
        "n_draws": N_DRAWS,
        "seed": SEED,
    }
)
