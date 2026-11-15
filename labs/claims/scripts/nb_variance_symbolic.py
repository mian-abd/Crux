"""Claim 1, exact check: derive the NB variance symbolically and compare expressions.

1. Sum the pmf  P(k) = Gamma(k + r) / (Gamma(r) k!) (r/(r+mu))^r (mu/(r+mu))^k  with
   r = 1/alpha against s^k to get the probability generating function G(s).
2. Check G(1) = 1, take mean = G'(1) and variance = G''(1) + G'(1) - G'(1)^2.
3. Cross-check with the gamma-Poisson mixture by symbolic integration and the law of total
   variance: Var(Y) = E[lambda] + Var(lambda), lambda ~ Gamma(shape r, scale alpha*mu).
4. Compare the variance exactly (simplify(difference) == 0) with mu + alpha*mu^2 and with
   mu + mu^2/alpha.
"""

import sympy as sp
from _common import emit


def proven(condition):
    """Decide a convergence condition with positive symbols, relation by relation."""

    def decide(rel):
        gap = sp.simplify(rel.rhs - rel.lhs)
        if isinstance(rel, sp.StrictLessThan):
            verdict = gap.is_positive
        elif isinstance(rel, sp.LessThan):
            verdict = gap.is_nonnegative
        elif isinstance(rel, sp.StrictGreaterThan):
            verdict = gap.is_negative
        elif isinstance(rel, sp.GreaterThan):
            verdict = gap.is_nonpositive
        elif isinstance(rel, sp.Unequality):
            verdict = gap.is_nonzero
        else:
            verdict = None
        return rel if verdict is None else sp.sympify(verdict)

    decided = condition.replace(lambda e: isinstance(e, sp.core.relational.Relational), decide)
    return bool(sp.simplify(decided) == sp.true)


k = sp.Symbol("k", integer=True, nonnegative=True)
s = sp.Symbol("s", positive=True)
mu, alpha, lam = sp.symbols("mu alpha lam", positive=True)
r = 1 / alpha
pmf = sp.gamma(k + r) / (sp.gamma(r) * sp.factorial(k)) * (r / (r + mu)) ** r
pmf *= (mu / (r + mu)) ** k
print(f"pmf: {sp.sstr(pmf)}")

# 1. generating function: the convergent branch of the series, valid at s = 1
series = sp.piecewise_fold(sp.summation(pmf * s**k, (k, 0, sp.oo)))
if isinstance(series, sp.Piecewise):
    branch, condition = series.args[0]
    converges_at_1 = proven(condition.subs(s, 1))
else:
    branch, converges_at_1 = series, True
pgf = sp.simplify(branch)
print(f"G(s) = {sp.sstr(pgf)} (series converges at s = 1: {converges_at_1})")

# 2. moments from the generating function
total = sp.simplify(pgf.subs(s, 1))
mean = sp.simplify(sp.diff(pgf, s).subs(s, 1))
factorial2 = sp.simplify(sp.diff(pgf, s, 2).subs(s, 1))
variance = sp.factor(sp.simplify(factorial2 + mean - mean**2))
print(f"G(1) = {sp.sstr(total)}, mean = {sp.sstr(mean)}, variance = {sp.sstr(variance)}")

# 3. gamma-Poisson mixture, law of total variance
density = lam ** (r - 1) * sp.exp(-lam / (alpha * mu)) / (sp.gamma(r) * (alpha * mu) ** r)
m1 = sp.simplify(sp.integrate(lam * density, (lam, 0, sp.oo)))
m2 = sp.simplify(sp.integrate(lam**2 * density, (lam, 0, sp.oo)))
mixture_variance = sp.factor(sp.simplify(m1 + (m2 - m1**2)))
print(f"mixture: E[lambda] = {sp.sstr(m1)}, Var(Y) = {sp.sstr(mixture_variance)}")

# 4. exact comparisons
alpha_form = mu + alpha * mu**2
inv_alpha_form = mu + mu**2 / alpha
eq_alpha = sp.simplify(variance - alpha_form) == 0
eq_inv = sp.simplify(variance - inv_alpha_form) == 0
print(f"variance - (mu + alpha*mu^2) = {sp.sstr(sp.simplify(variance - alpha_form))}")
print(f"variance - (mu + mu^2/alpha) = {sp.sstr(sp.simplify(variance - inv_alpha_form))}")

# 5. the same comparison as numbers: exact residuals on a grid of rational (mu, alpha)
grid = [(sp.Rational(m), sp.Rational(a)) for m in ("1/2", "5", "40") for a in ("1/20", "1/3", "3")]


def max_abs_residual(form):
    return max(abs((variance - form).subs({mu: m, alpha: a})) for m, a in grid)


residual_alpha = max_abs_residual(alpha_form)
residual_inv = max_abs_residual(inv_alpha_form)
print(f"largest |variance - form| on {len(grid)} grid points: {residual_alpha} and {residual_inv}")

emit(
    {
        "max_abs_residual_alpha_form": float(residual_alpha),
        "max_abs_residual_inv_alpha_form": float(residual_inv),
        "variance": sp.sstr(variance),
        "pgf": sp.sstr(pgf),
        "series_converges_at_1": bool(converges_at_1),
        "normalised": bool(sp.simplify(total - 1) == 0),
        "mean_is_mu": bool(sp.simplify(mean - mu) == 0),
        "mixture_agrees": bool(sp.simplify(mixture_variance - variance) == 0),
        "eq_alpha_form": bool(eq_alpha),
        "eq_inv_alpha_form": bool(eq_inv),
    }
)
