"""Claim 4, cheap counterexample search: the smallest setting where BH's FWER exceeds q.

Walks m = 2, 3, ..., 8 and m0 = 1, ..., m - 1 true nulls, the other tests being strong
signals (z ~ N(6, 1)). For each setting, 200,000 simulated experiments estimate the FWER of
BH at q = 0.05 with a 99.9% lower confidence bound; the search stops at the first setting
whose lower bound is above q + 0.005.
"""

import math

import numpy as np
from _common import ALPHA, bh_experiment, emit

SEED = 4202
EFFECT = 6.0
REPS = 200_000
MARGIN = 0.005
Z = 3.29  # one-sided 99.95% normal quantile: a 99.9% two-sided interval

rng = np.random.default_rng(SEED)
found, tried, best = None, 0, 0.0
for m in range(2, 9):
    for m0 in range(1, m):
        tried += 1
        false_rej, _ = bh_experiment(rng, m, m0, EFFECT, REPS)
        fwer = float(np.mean(false_rej >= 1))
        lower = fwer - Z * math.sqrt(fwer * (1 - fwer) / REPS)
        best = max(best, fwer)
        print(f"m={m} m0={m0}: FWER {fwer:.4f} (99.9% lower bound {lower:.4f})")
        if lower > ALPHA + MARGIN:
            found = (m, m0, fwer, lower)
            break
    if found:
        break

if found:
    m, m0, fwer, lower = found
    print(f"counterexample: m={m}, {m0} true nulls, {m - m0} strong signals -> FWER {fwer:.4f}")
else:
    m = m0 = 0
    fwer = lower = 0.0
    print("no setting exceeded q")

emit(
    {
        "found": found is not None,
        "m": m,
        "m0": m0,
        "fwer": round(fwer, 6),
        "fwer_lower": round(lower, 6),
        "max_fwer_seen": round(best, 6),
        "settings_tried": tried,
        "reps": REPS,
        "seed": SEED,
    }
)
