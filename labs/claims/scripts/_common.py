"""Shared helpers for the claims diagnostics.

``labs.claims.library.script_code`` inlines this file into each script before it runs, so
every pre-registered diagnostic is one self-contained Python file. Each script prints a few
log lines and exactly one ``RESULT: {json}`` line with flat values.
"""

import json
import math

import numpy as np
from scipy.special import ndtr

ALPHA = 0.05  # the nominal level every test and procedure here is run at


def emit(result: dict) -> None:
    """Print the single machine-read result line (finite numbers only)."""
    for key, value in result.items():
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f"{key} is not finite")
    print("RESULT: " + json.dumps(result, sort_keys=True))


def nb_counts(rng, mu, alpha, size=None):
    """Negative binomial counts with mean ``mu`` and dispersion ``alpha``.

    Size parametrisation r = 1/alpha, success probability r / (r + mu): numpy's sampler
    counts failures before the r-th success, so the mean is mu.
    """
    r = 1.0 / np.asarray(alpha, dtype=float)
    p = r / (r + np.asarray(mu, dtype=float))
    return rng.negative_binomial(r, p, size=size)


# --- Wald test on the log fold change (claim 2) ------------------------------------------

N_GENES = 20_000
N_PER_GROUP = 3
MU_RANGE = (10.0, 1000.0)  # gene means, log-uniform
TREND = (0.05, 1.0)  # true dispersion trend alpha(mu) = a0 + a1 / mu ...
SCATTER_SDLOG = 0.3  # ... times a gene-level log-normal factor


def null_counts(rng, n_genes=N_GENES, n=N_PER_GROUP):
    """Counts with no differential expression: both groups share each gene's mean."""
    mu = np.exp(rng.uniform(math.log(MU_RANGE[0]), math.log(MU_RANGE[1]), n_genes))
    a0, a1 = TREND
    alpha = (a0 + a1 / mu) * np.exp(rng.normal(0.0, SCATTER_SDLOG, n_genes))
    y = nb_counts(rng, mu[:, None], alpha[:, None], size=(n_genes, 2 * n)).astype(float)
    return mu, alpha, y[:, :n], y[:, n:]


def wald_pvalues(a, b, dispersion):
    """Two-sided Wald p-values for log(mean_b / mean_a) with a delta-method standard error.

    For the mean of n NB counts, Var(log mean) ~ (1/mu + alpha) / n. The group means are
    plugged in for mu (the unrestricted estimates, as in a Wald test) and ``dispersion`` for
    alpha; z is compared with the standard normal. A gene with a zero group mean gets p = 1.
    """
    ma, mb = a.mean(axis=1), b.mean(axis=1)
    ok = (ma > 0) & (mb > 0)
    ma, mb = np.where(ok, ma, 1.0), np.where(ok, mb, 1.0)
    se = np.sqrt((1 / ma + dispersion) / a.shape[1] + (1 / mb + dispersion) / b.shape[1])
    z = (np.log(mb) - np.log(ma)) / se
    return np.where(ok, 2 * ndtr(-np.abs(z)), 1.0)


def mom_dispersion(a, b):
    """Per-gene method-of-moments dispersion, (s^2 - m) / m^2 averaged over the two groups.

    Returns the raw estimate (may be negative) and the usable one, floored at 1e-8.
    """
    raw = []
    for group in (a, b):
        m = group.mean(axis=1)
        v = group.var(axis=1, ddof=1)
        raw.append((v - m) / np.maximum(m, 1e-12) ** 2)
    est = (raw[0] + raw[1]) / 2
    return est, np.maximum(est, 1e-8)


def trend_dispersion(a, b, raw):
    """Moderated dispersion: a mean-dispersion trend a0 + a1/mean fitted across all genes.

    Least squares of the raw per-gene estimates on 1/mean, then every gene takes the trend
    value at its own mean (full shrinkage to the trend).
    """
    mean = np.concatenate([a, b], axis=1).mean(axis=1)
    design = np.column_stack([np.ones_like(mean), 1 / np.maximum(mean, 1e-12)])
    coef, *_ = np.linalg.lstsq(design, raw, rcond=None)
    return np.maximum(design @ coef, 1e-8), coef


# --- Benjamini-Hochberg (claims 3 and 4) -------------------------------------------------


def bh_reject(p, q=ALPHA):
    """Benjamini-Hochberg step-up on each row of ``p`` (reps x m): a rejection mask."""
    reps, m = p.shape
    sorted_p = np.sort(p, axis=1)
    below = sorted_p <= q * np.arange(1, m + 1) / m
    k = m - 1 - np.argmax(below[:, ::-1], axis=1)  # last rank under its threshold
    cutoff = np.where(below.any(axis=1), sorted_p[np.arange(reps), k], -1.0)
    return p <= cutoff[:, None]


def bh_experiment(rng, m, m0, effect, reps, q=ALPHA):
    """Independent one-sided z-tests: m0 true nulls (z ~ N(0,1)) and m - m0 alternatives
    (z ~ N(effect, 1)); p = 1 - Phi(z). Returns false rejections V and all rejections R."""
    z = rng.standard_normal((reps, m))
    z[:, m0:] += effect
    reject = bh_reject(ndtr(-z), q)
    return reject[:, :m0].sum(axis=1), reject.sum(axis=1)
