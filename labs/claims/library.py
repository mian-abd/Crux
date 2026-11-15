"""The curated claim library: four claims from the DESeq2 paper and their diagnostics.

This is an MVP on a hand-curated set. Each claim is one categorical question with two or
three options (stable ``answer_key``s); the orchestrator adds "none of these". Each
diagnostic is a pre-registered Python script under ``scripts/`` (``_common.py`` inlined)
that prints one ``RESULT: {json}`` line, plus outcome bins whose rules code evaluates
(``core.schemas.eval_rule``; exhaustive and mutually exclusive, which the tests check; each
rule names its headline numeric statistic first, which the UI's key number reads), a
``stated`` table ``{answer_key: {bin_id: p}}`` saying what each option predicts, and an
estimated cost in seconds (no money is spent). ``agents.predictor.SampledPredictor`` reads
the stated rows as library rows, so no model is asked for a likelihood.

Adding a claim: write its scripts, add a ``Claim`` to ``CLAIMS`` with its options and
diagnostics, add its source entry in ``labs.claims.source``, and run the tests.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Literal

from core.schemas import Experiment, Hypothesis, OutcomeBin, Question

SCRIPTS = Path(__file__).parent / "scripts"
ANSWER_KEYS = ("holds", "fails", "holds_if", "alt_param", "fails_conservative")
_IMPORT = re.compile(r"^from _common import (?:\([^)]*\)|[^\n]*)\n", re.MULTILINE)


@cache
def script_code(name: str) -> str:
    """The runnable source of one diagnostic, with the shared helpers inlined."""
    source = (SCRIPTS / f"{name}.py").read_text(encoding="utf-8")
    common = (SCRIPTS / "_common.py").read_text(encoding="utf-8")
    if len(_IMPORT.findall(source)) != 1:
        raise ValueError(f"{name}.py must import from _common exactly once")
    return _IMPORT.sub(lambda _: common + "\n", source, count=1)


@dataclass(frozen=True)
class Diagnostic:
    name: str  # script name and experiment id
    goal: str
    bins: tuple[tuple[str, str, str], ...]  # (id, description, rule)
    stated: dict[str, dict[str, float]]
    est_cost_s: float
    summary: tuple[str, ...]  # result keys quoted in notes and CLAIMS.md


@dataclass(frozen=True)
class Option:
    answer_key: str
    statement: str
    rationale: str


@dataclass(frozen=True)
class Claim:
    id: str  # the engine's question id
    title: str
    claim: str
    question: str
    kind: Literal["symbolic", "statistical"]
    impact: float
    options: tuple[Option, ...]
    diagnostics: tuple[Diagnostic, ...]
    limits: tuple[str, ...] = field(default_factory=tuple)


def complement(*rules: str) -> str:
    """A rule that holds exactly when none of ``rules`` does."""
    return " and ".join(f"not ({rule})" for rule in rules)


# --- claim 1: NB variance -----------------------------------------------------------------

_SYM_OK = "normalised and mean_is_mu and mixture_agrees and series_converges_at_1"
_SYM_ALPHA = (
    f"max_abs_residual_alpha_form == 0 and eq_alpha_form and not eq_inv_alpha_form and {_SYM_OK}"
)
_SYM_INV = (
    f"max_abs_residual_inv_alpha_form == 0 and eq_inv_alpha_form and not eq_alpha_form "
    f"and {_SYM_OK}"
)
_MC_ALPHA = "max_rel_err_alpha_form <= 0.05 and max_rel_err_inv_alpha_form > 0.05"
_MC_INV = "max_rel_err_inv_alpha_form <= 0.05 and max_rel_err_alpha_form > 0.05"

# --- claim 2: Wald calibration ------------------------------------------------------------

_CONS, _ANTI = "fpr < 0.04", "fpr > 0.065"
_CAL = "fpr >= 0.04 and fpr <= 0.065"
_PG_ANTI = "fpr_pergene > 0.065"
_PG_CAL = "fpr_pergene >= 0.04 and fpr_pergene <= 0.065"
_MOD_CAL = "fpr_moderated >= 0.04 and fpr_moderated <= 0.065"
_GAP = f"{_PG_ANTI} and {_MOD_CAL}"
_BOTH_CAL = f"{_PG_CAL} and {_MOD_CAL}"
_BOTH_CONS = "fpr_pergene < 0.04 and fpr_moderated < 0.04"


def _fpr_bins(subject: str) -> tuple[tuple[str, str, str], ...]:
    return (
        ("conservative", f"{subject}: FPR below 0.04", _CONS),
        ("calibrated", f"{subject}: FPR in [0.04, 0.065]", _CAL),
        ("anti_conservative", f"{subject}: FPR above 0.065", _ANTI),
    )


# --- claims 3 and 4: Benjamini-Hochberg ---------------------------------------------------

_FDR_WITHIN = "fdr <= 0.0475"
_FDR_ABOVE = "fdr > 0.0475 and fdr <= 0.0525"
_FDR_EXCEEDS = "fdr > 0.0525"
_SWEEP_NONE = "max_excess_z <= 4 and max_alpha_z <= 4"
_SWEEP_ABOVE = "max_excess_z > 4 and max_alpha_z <= 4"
_SWEEP_EXCEEDS = "max_alpha_z > 4"
_FWER_OK = "fwer <= 0.055"
_FWER_OVER = "fwer > 0.055 and fwer <= 0.1"
_FWER_FAR = "fwer > 0.1"
_CX_CLEAR = "fwer > 0.055 and fwer_lower > 0.055 and found"

CLAIMS: tuple[Claim, ...] = (
    Claim(
        id="claim-nb-variance",
        title="Negative binomial variance",
        claim="A negative binomial count with mean μ and dispersion α has variance μ + αμ².",
        question=(
            "Does a negative binomial count with mean μ and dispersion α "
            "(size r = 1/α) have variance μ + αμ²?"
        ),
        kind="symbolic",
        impact=0.9,
        options=(
            Option(
                "holds",
                "Yes: the variance is μ + αμ².",
                "With size r = 1/α the NB variance is μ + μ²/r, which is μ + αμ².",
            ),
            Option(
                "alt_param",
                "No: the variance is μ + μ²/α.",
                "This is the variance if α is read as the size parameter instead of its "
                "inverse, a common parametrisation mix-up.",
            ),
        ),
        diagnostics=(
            Diagnostic(
                name="nb_variance_symbolic",
                goal=(
                    "Derive the NB variance exactly with SymPy: sum the pmf (size 1/α) into "
                    "its generating function, differentiate, cross-check with the "
                    "gamma-Poisson mixture, and compare with μ + αμ² and μ + μ²/α"
                ),
                bins=(
                    ("alpha_form", "the derived variance is exactly μ + αμ²", _SYM_ALPHA),
                    ("inv_form", "the derived variance is exactly μ + μ²/α", _SYM_INV),
                    (
                        "neither",
                        "neither form, or the derivation's checks failed",
                        complement(_SYM_ALPHA, _SYM_INV),
                    ),
                ),
                stated={
                    "holds": {"alpha_form": 0.97, "inv_form": 0.0, "neither": 0.03},
                    "alt_param": {"alpha_form": 0.0, "inv_form": 0.97, "neither": 0.03},
                },
                est_cost_s=3,
                summary=(
                    "variance",
                    "max_abs_residual_alpha_form",
                    "max_abs_residual_inv_alpha_form",
                    "mixture_agrees",
                ),
            ),
            Diagnostic(
                name="nb_variance_montecarlo",
                goal=(
                    "Draw 200,000 NB counts at four (μ, α) settings and compare the sample "
                    "variance with μ + αμ² and with μ + μ²/α (relative error 5%)"
                ),
                bins=(
                    ("alpha_form", "within 5% of μ + αμ² at every setting", _MC_ALPHA),
                    ("inv_form", "within 5% of μ + μ²/α at every setting", _MC_INV),
                    (
                        "neither",
                        "neither formula fits every setting",
                        complement(_MC_ALPHA, _MC_INV),
                    ),
                ),
                stated={
                    "holds": {"alpha_form": 0.90, "inv_form": 0.02, "neither": 0.08},
                    "alt_param": {"alpha_form": 0.02, "inv_form": 0.90, "neither": 0.08},
                },
                est_cost_s=1,
                summary=("max_rel_err_alpha_form", "max_rel_err_inv_alpha_form", "n_draws"),
            ),
        ),
        limits=(
            (
                "The claim is checked under the size parametrisation r = 1/α that DESeq2 uses; "
                "under another parametrisation the symbol α means something else."
            ),
            (
                "The Monte Carlo check covers four (μ, α) settings; the symbolic derivation covers "
                "all positive μ and α."
            ),
        ),
    ),
    Claim(
        id="claim-wald-calibration",
        title="Wald test calibration with 3 replicates",
        claim=(
            "With 3 replicates per group, Wald-test p-values from the negative binomial GLM "
            "are calibrated under the null."
        ),
        question=(
            "With 3 replicates per group, are Wald-test p-values from the negative binomial "
            "model calibrated under the null (about 5% of null genes at p < 0.05)?"
        ),
        kind="statistical",
        impact=1.0,
        options=(
            Option(
                "holds",
                "Calibrated, whichever dispersion estimate is plugged in.",
                "The Wald statistic is asymptotically normal, so even per-gene dispersion "
                "estimates give about 5% false positives.",
            ),
            Option(
                "holds_if",
                "Calibrated only when the dispersion is moderated (shared across genes) or "
                "known; with per-gene estimates the test is anti-conservative.",
                "Six counts estimate a gene's dispersion poorly, and underestimates shrink the "
                "standard error; borrowing strength across genes removes that.",
            ),
            Option(
                "fails_conservative",
                "Conservative: fewer than 5% of null genes reach p < 0.05.",
                "Overestimated dispersions and the discreteness of small counts push p-values up.",
            ),
        ),
        diagnostics=(
            Diagnostic(
                name="wald_pergene",
                goal=(
                    "Simulate 20,000 null genes (3 vs 3, NB) and measure the Wald test's "
                    "false-positive rate at p < 0.05 with per-gene method-of-moments dispersion"
                ),
                bins=_fpr_bins("per-gene dispersion"),
                stated={
                    "holds": {"conservative": 0.05, "calibrated": 0.85, "anti_conservative": 0.10},
                    "holds_if": {
                        "conservative": 0.02,
                        "calibrated": 0.10,
                        "anti_conservative": 0.88,
                    },
                    "fails_conservative": {
                        "conservative": 0.85,
                        "calibrated": 0.12,
                        "anti_conservative": 0.03,
                    },
                },
                est_cost_s=1,
                summary=("fpr", "fpr_se", "frac_dispersion_at_floor"),
            ),
            Diagnostic(
                name="wald_known",
                goal=(
                    "Simulate 20,000 null genes (3 vs 3, NB) and measure the Wald test's "
                    "false-positive rate at p < 0.05 with the true dispersion"
                ),
                bins=_fpr_bins("known dispersion"),
                stated={
                    "holds": {"conservative": 0.05, "calibrated": 0.88, "anti_conservative": 0.07},
                    "holds_if": {
                        "conservative": 0.05,
                        "calibrated": 0.88,
                        "anti_conservative": 0.07,
                    },
                    "fails_conservative": {
                        "conservative": 0.85,
                        "calibrated": 0.12,
                        "anti_conservative": 0.03,
                    },
                },
                est_cost_s=1,
                summary=("fpr", "fpr_se"),
            ),
            Diagnostic(
                name="wald_pergene_vs_moderated",
                goal=(
                    "On the same 20,000 simulated null genes (3 vs 3, NB), compare the Wald "
                    "test's false-positive rate with per-gene dispersion and with moderated "
                    "dispersion (a mean-dispersion trend fitted across genes)"
                ),
                bins=(
                    (
                        "gap_closes",
                        "per-gene FPR above 0.065 and moderated FPR in [0.04, 0.065]",
                        _GAP,
                    ),
                    ("both_calibrated", "both FPRs in [0.04, 0.065]", _BOTH_CAL),
                    ("both_conservative", "both FPRs below 0.04", _BOTH_CONS),
                    ("other", "any other pattern", complement(_GAP, _BOTH_CAL, _BOTH_CONS)),
                ),
                stated={
                    "holds": {
                        "gap_closes": 0.08,
                        "both_calibrated": 0.80,
                        "both_conservative": 0.02,
                        "other": 0.10,
                    },
                    "holds_if": {
                        "gap_closes": 0.82,
                        "both_calibrated": 0.06,
                        "both_conservative": 0.02,
                        "other": 0.10,
                    },
                    "fails_conservative": {
                        "gap_closes": 0.02,
                        "both_calibrated": 0.08,
                        "both_conservative": 0.80,
                        "other": 0.10,
                    },
                },
                est_cost_s=1.5,
                summary=("fpr_pergene", "fpr_moderated", "trend_a0", "trend_a1"),
            ),
        ),
        limits=(
            (
                "The Wald test here is a hand-written test on the log ratio of group means with a "
                "delta-method standard error (equal size factors, no covariates), not DESeq2's "
                "IRLS fit; the moderated dispersion is full shrinkage to a fitted trend, not "
                "DESeq2's empirical Bayes MAP estimate."
            ),
            (
                "One simulation design: gene means log-uniform on [10, 1000], dispersion trend "
                "0.05 + 1/μ with log-normal scatter (sd 0.3). Lower counts or other dispersion "
                "patterns were not tested."
            ),
        ),
    ),
    Claim(
        id="claim-bh-fdr",
        title="Benjamini-Hochberg controls the FDR",
        claim=(
            "Benjamini–Hochberg adjusted p-values below α control the false discovery rate "
            "at α (independent tests)."
        ),
        question=(
            "Do Benjamini–Hochberg adjusted p-values below α control the false discovery rate "
            "at α when the tests are independent?"
        ),
        kind="statistical",
        impact=0.95,
        options=(
            Option(
                "holds",
                "Yes: the FDR is at most α (π0·α for independent continuous tests).",
                "The step-up procedure's FDR equals π0·α under independence.",
            ),
            Option(
                "fails",
                "No: the FDR can exceed α even for independent tests.",
                "The guarantee might need conditions that independent tests do not meet.",
            ),
        ),
        diagnostics=(
            Diagnostic(
                name="bh_fdr_sim",
                goal=(
                    "Simulate 2,000 experiments of 1,000 independent z-tests (90% true nulls) "
                    "and measure BH's false discovery rate at q = 0.05"
                ),
                bins=(
                    ("within_bound", "FDR at most π0·α + 0.0025 = 0.0475", _FDR_WITHIN),
                    ("above_bound", "FDR in (0.0475, 0.0525]", _FDR_ABOVE),
                    ("exceeds_alpha", "FDR above α + 0.0025 = 0.0525", _FDR_EXCEEDS),
                ),
                stated={
                    "holds": {"within_bound": 0.85, "above_bound": 0.12, "exceeds_alpha": 0.03},
                    "fails": {"within_bound": 0.15, "above_bound": 0.25, "exceeds_alpha": 0.60},
                },
                est_cost_s=1,
                summary=("fdr", "fdr_se", "pi0", "mean_rejections"),
            ),
            Diagnostic(
                name="bh_fdr_sweep",
                goal=(
                    "Search nine settings (m = 10 to 1,000 independent tests, π0 = 0.5 to 1) for "
                    "one where BH's simulated FDR exceeds π0·α or α by more than 4 standard "
                    "errors"
                ),
                bins=(
                    (
                        "none_above_bound",
                        "no setting exceeds π0·α (or α) by more than 4 standard errors",
                        _SWEEP_NONE,
                    ),
                    (
                        "above_bound_within_alpha",
                        "some setting exceeds π0·α, none exceeds α",
                        _SWEEP_ABOVE,
                    ),
                    ("exceeds_alpha", "some setting exceeds α", _SWEEP_EXCEEDS),
                ),
                stated={
                    "holds": {
                        "none_above_bound": 0.92,
                        "above_bound_within_alpha": 0.05,
                        "exceeds_alpha": 0.03,
                    },
                    "fails": {
                        "none_above_bound": 0.10,
                        "above_bound_within_alpha": 0.20,
                        "exceeds_alpha": 0.70,
                    },
                },
                est_cost_s=1.5,
                summary=("max_excess_z", "max_alpha_z", "worst_setting"),
            ),
        ),
        limits=(
            (
                "Simulations check the guarantee at the settings tried; they are not a proof. The "
                "proof for independent tests is Benjamini and Hochberg (1995)."
            ),
            "Dependent tests (for example correlated genes) were not simulated.",
        ),
    ),
    Claim(
        id="claim-bh-fwer",
        title="Benjamini-Hochberg controls the FWER",
        claim="Benjamini–Hochberg adjustment controls the family-wise error rate at α.",
        question=(
            "Does Benjamini–Hochberg adjustment control the family-wise error rate (the chance "
            "of any false rejection) at α?"
        ),
        kind="statistical",
        impact=0.95,
        options=(
            Option(
                "holds",
                "Yes: the chance of at least one false rejection is at most α.",
                "Adjusted p-values below α would then be safe for every single gene.",
            ),
            Option(
                "fails",
                "No: BH controls the FDR, not the FWER; with true signals present the chance of "
                "at least one false rejection can exceed α.",
                "BH's thresholds grow with the number of rejections, so true signals loosen the "
                "threshold for the nulls.",
            ),
        ),
        diagnostics=(
            Diagnostic(
                name="bh_fwer_sim",
                goal=(
                    "Simulate 2,000 experiments of 1,000 independent z-tests (90% true nulls) "
                    "and measure BH's family-wise error rate at q = 0.05"
                ),
                bins=(
                    ("controlled", "FWER at most α + 0.005", _FWER_OK),
                    ("exceeds", "FWER in (0.055, 0.1]", _FWER_OVER),
                    ("far_exceeds", "FWER above 2α = 0.1", _FWER_FAR),
                ),
                stated={
                    "holds": {"controlled": 0.90, "exceeds": 0.07, "far_exceeds": 0.03},
                    "fails": {"controlled": 0.10, "exceeds": 0.20, "far_exceeds": 0.70},
                },
                est_cost_s=1,
                summary=("fwer", "mean_false_rejections", "fdr"),
            ),
            Diagnostic(
                name="bh_fwer_counterexample",
                goal=(
                    "Search the smallest settings (m = 2 to 8 tests, strong signals for the "
                    "non-nulls) for one where BH's FWER clearly exceeds q = 0.05 (99.9% lower "
                    "bound above 0.055)"
                ),
                bins=(
                    (
                        "clear_counterexample",
                        "a setting whose FWER lower bound is above 0.055",
                        _CX_CLEAR,
                    ),
                    (
                        "marginal",
                        "some FWER estimate above 0.055 but no clear counterexample",
                        f"max_fwer_seen > 0.055 and {complement(_CX_CLEAR)}",
                    ),
                    (
                        "none_found",
                        "every FWER estimate at most 0.055",
                        f"max_fwer_seen <= 0.055 and {complement(_CX_CLEAR)}",
                    ),
                ),
                stated={
                    "holds": {"clear_counterexample": 0.01, "marginal": 0.04, "none_found": 0.95},
                    "fails": {"clear_counterexample": 0.85, "marginal": 0.10, "none_found": 0.05},
                },
                est_cost_s=1,
                summary=("m", "m0", "fwer", "fwer_lower", "settings_tried"),
            ),
        ),
        limits=(
            (
                "Under the global null (every test null) BH's FWER equals α, so the claim fails "
                "only when true signals are present, which is the usual case."
            ),
        ),
    ),
)

CLAIMS_BY_ID: dict[str, Claim] = {c.id: c for c in CLAIMS}
DIAGNOSTICS: dict[str, tuple[Claim, Diagnostic]] = {
    d.name: (c, d) for c in CLAIMS for d in c.diagnostics
}


def experiment(claim: Claim, diagnostic: Diagnostic) -> Experiment:
    """The pre-registered experiment for one diagnostic of one claim."""
    return Experiment(
        id=diagnostic.name,
        question_ids=[claim.id],
        kind="compute",
        goal=diagnostic.goal,
        language="python",
        code=script_code(diagnostic.name),
        design={
            "library": "claims",
            "claim": claim.id,
            "diagnostic": diagnostic.name,
            "stated": {key: dict(row) for key, row in diagnostic.stated.items()},
        },
        bins=[OutcomeBin(id=i, description=d, rule=r) for i, d, r in diagnostic.bins],
        est_cost_s=diagnostic.est_cost_s,
    )


def questions() -> tuple[list[Question], list[Hypothesis]]:
    """The curated questions and their options (fresh models on every call)."""
    qs, hyps = [], []
    for c in CLAIMS:
        qs.append(
            Question(
                id=c.id, text=c.question, kind="categorical", impact=c.impact, raised_by="library"
            )
        )
        for o in c.options:
            hyps.append(
                Hypothesis(
                    id=f"{c.id}.{o.answer_key}",
                    question_id=c.id,
                    statement=o.statement,
                    author="library",
                    rationale=o.rationale,
                    answer_key=o.answer_key,
                    prior=1.0,
                    posterior=1.0,
                )
            )
    return qs, hyps


def diagnostics_for(question_id: str) -> list[Experiment]:
    """The question's pre-registered diagnostics, or none for an unknown question."""
    claim = CLAIMS_BY_ID.get(question_id)
    return [experiment(claim, d) for d in claim.diagnostics] if claim else []
