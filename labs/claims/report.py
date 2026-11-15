"""Verdicts and write-ups for the claims lab, built from the run's facts only.

``claims_markdown(state)`` is the deliverable (``CLAIMS.md``); ``methods_markdown(state)``
is the reporter's methods text. Both read the orchestrator's ``EngineState`` (questions,
options, trials, rejections), the curated library and, for the reason an unresolved
question stopped, the run's own event file; nothing here calls a model or decides a belief.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from core.events import EVENTS_FILE, QUESTION_UNRESOLVED
from core.schemas import EngineState, Hypothesis, Trial
from labs.claims.library import CLAIMS, CLAIMS_BY_ID, DIAGNOSTICS
from labs.claims.source import CITATION, LICENSE, SOURCE, TITLE, URL

VERDICTS = {
    "holds": "holds",
    "holds_if": "holds only under a condition",
    "fails": "refuted",
    "fails_conservative": "refuted",
    "alt_param": "refuted",
}

MVP_LIMITS = (
    (
        "This is an MVP on four hand-curated claims. Extracting claims from an arbitrary paper "
        "is not implemented: the claims, their options and their diagnostics were written by "
        "hand and pre-registered before the run."
    ),
    (
        "Simulation diagnostics are evidence at the settings they try, not proofs. The symbolic "
        "diagnostic is an exact computer-algebra derivation, not a checked formal proof."
    ),
    (
        "Each verdict is the engine's posterior over the curated options plus 'none of these'; "
        "an option outside that list can only show up as mass on 'none of these'."
    ),
)


def verdict(state: EngineState, question_id: str) -> tuple[str, Hypothesis | None]:
    """The verdict label for one claim and the option it follows (``None`` if none settled).

    A settled (or robust) question takes its option's verdict. Otherwise the claim is
    "refuted" when its own option (``holds``) was rejected by evidence and no qualified
    version (``holds_if``) is still standing, even though which alternative is true stayed
    unresolved; in every other case it is "unresolved".
    """
    q = state.questions[question_id]
    if q.status == "settled":
        h = state.best(question_id)
        if h is not None:
            return VERDICTS.get(h.answer_key or "", "unresolved"), h
    live = state.options(question_id, active_only=True, include_null=False)
    if q.status == "robust" and live:
        return VERDICTS.get(live[0].answer_key or "", "unresolved"), live[0]
    own = [h for h in state.options(question_id) if h.answer_key == "holds"]
    qualified = any(h.answer_key == "holds_if" for h in live)
    if own and all(h.status == "rejected" for h in own) and not qualified:
        return "refuted", None
    return "unresolved", None


def _fmt(value: object) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        if not math.isfinite(value):
            return str(value)
        if value.is_integer() and abs(value) < 1e15:
            return str(int(value))
        return f"{value:.4g}"
    return str(value)


def key_numbers(trial: Trial) -> str:
    """The diagnostic's summary keys from its result, as ``key = value`` pairs."""
    value = trial.observation.value
    name = (trial.experiment.design or {}).get("diagnostic", "")
    entry = DIAGNOSTICS.get(name)
    if not isinstance(value, dict) or entry is None:
        return "-"
    keys = [k for k in entry[1].summary if k in value]
    return ", ".join(f"{k} = {_fmt(value[k])}" for k in keys) or "-"


def _bin_label(trial: Trial) -> str:
    bin_id = trial.observation.bin_id or "-"
    desc = next((b.description for b in trial.experiment.bins if b.id == bin_id), "")
    return f"`{bin_id}` ({desc})" if desc else f"`{bin_id}`"


def _null_mass(state: EngineState, question_id: str) -> float:
    return sum(h.posterior for h in state.options(question_id) if h.is_null)


def _unresolved_reason(state: EngineState, question_id: str) -> str:
    """The reason in the run's last ``question.unresolved`` event for this question."""
    reason = ""
    try:
        lines = (Path(state.run_dir) / EVENTS_FILE).read_text(encoding="utf-8").splitlines()
    except OSError:
        return ""
    for line in lines:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        p = event.get("payload") or {}
        if event.get("type") == QUESTION_UNRESOLVED and p.get("question_id") == question_id:
            reason = str(p.get("reason", ""))
    return reason


def _evidence_trial(state: EngineState, evidence_id: str | None) -> Trial | None:
    ev = state.evidence.get(evidence_id or "")
    if ev is None or not ev.source_ref:
        return None
    return next((t for t in state.trials if t.experiment.id == ev.source_ref), None)


def _summary_row(i: int, state: EngineState, question_id: str) -> str:
    claim = CLAIMS_BY_ID[question_id]
    label, h = verdict(state, question_id)
    p = f"{h.posterior:.3f}" if h is not None else "-"
    if h is None and label == "refuted":
        p = "`holds` rejected"
    runs = len(state.trials_for(question_id))
    return f"| {i}. {claim.title} | {label} | {p} | {runs} |"


def _claim_section(i: int, state: EngineState, question_id: str) -> list[str]:
    claim = CLAIMS_BY_ID[question_id]
    q = state.questions[question_id]
    label, h = verdict(state, question_id)
    quote, planted = SOURCE.get(question_id, ("", False))
    trials = state.trials_for(question_id)
    lines = [f"## {i}. {claim.title} (`{question_id}`)", "", f"> {claim.claim}", ""]
    if planted:
        lines.append(
            "Source: planted. The paper does not make this claim; it was added as a known "
            "falsehood to test the audit. The agents were not told."
        )
    elif quote:
        lines.append(f'Source passage (our paraphrase of the Methods): "{quote}"')
    lines += [f"Kind: {claim.kind}", ""]
    if h is not None:
        lines.append(
            f'**Verdict:** {label}. Accepted option (`{h.answer_key}`): "{h.statement}" '
            f"Posterior {h.posterior:.3f} ({q.status} after {len(trials)} diagnostics); "
            f"'none of these' {_null_mass(state, question_id):.3f}."
        )
    else:
        live = sorted(
            state.options(question_id, active_only=True, include_null=False),
            key=lambda o: -o.posterior,
        )
        standing = ", ".join(f"`{o.answer_key}` {o.posterior:.3f}" for o in live) or "none"
        null = _null_mass(state, question_id)
        if label == "refuted":
            lines.append(
                f"**Verdict:** refuted. The claim's own option (`holds`) was rejected by the "
                f"evidence below. Which alternative is true stayed {q.status}: {standing}; "
                f"'none of these' {null:.3f}."
            )
        else:
            lines.append(
                f"**Verdict:** unresolved. Options still standing: {standing}; "
                f"'none of these' {null:.3f}."
            )
        if q.status == "unresolved":
            reason = _unresolved_reason(state, question_id)
            if reason:
                lines.append(f"The engine stopped on this question: {reason}.")
    lines += ["", "### Deciding diagnostics", ""]
    if trials:
        lines += ["| # | Diagnostic | Observed | Key numbers |", "|---|---|---|---|"]
        for n, t in enumerate(trials, start=1):
            lines.append(
                f"| {n} | `{t.experiment.id}`: {t.experiment.goal} | {_bin_label(t)} "
                f"| {key_numbers(t)} |"
            )
    else:
        lines.append("No valid diagnostic ran.")
    invalid = [
        t for t in state.trials_for(question_id, valid_only=False) if not t.observation.valid
    ]
    if invalid:
        lines += ["", "Runs the referee ruled invalid (not counted):", ""]
        lines += [f"- `{t.experiment.id}`: {t.observation.referee_note}" for t in invalid]
    lines += ["", "### Rejected options", ""]
    rejected = [r for r in state.rejected if r["question"] == question_id]
    if not rejected:
        lines.append("None.")
    for r in rejected:
        opt = state.hypotheses[r["hypothesis"]]
        t = _evidence_trial(state, r.get("evidence_id"))
        evidence = (
            f" Evidence: `{t.experiment.id}` observed {_bin_label(t)}; {key_numbers(t)}."
            if t is not None
            else ""
        )
        lines.append(f'- `{opt.answer_key}`: "{opt.statement}" Rejected: {r["reason"]}.{evidence}')
    lines += ["", "### Limits", ""]
    lines += [f"- {text}" for text in claim.limits]
    lines.append("")
    return lines


def claims_markdown(state: EngineState) -> str:
    """``CLAIMS.md``: per claim the verdict, deciding diagnostics, rejections and limits."""
    ids = [c.id for c in CLAIMS if c.id in state.questions]
    lines = [
        "# Claims audit: DESeq2 (Love, Huber & Anders 2014)",
        "",
        (
            "MVP on a hand-curated set of four claims. Each claim was audited by the Crux engine "
            "with pre-registered symbolic or simulation diagnostics, chosen by expected "
            "information gain per cost, checked by a blind code referee and combined by Bayes' "
            "rule. Verdicts: holds, refuted, holds only under a condition, or unresolved."
        ),
        "",
        f"Source: [{TITLE}]({URL}), {CITATION}, {LICENSE}. Claim texts are paraphrased.",
        "",
        "| Claim | Verdict | Posterior | Diagnostics run |",
        "|---|---|---|---|",
    ]
    lines += [_summary_row(i, state, qid) for i, qid in enumerate(ids, start=1)]
    lines.append("")
    for i, qid in enumerate(ids, start=1):
        lines += _claim_section(i, state, qid)
    lines += ["## What this MVP does not do", ""]
    lines += [f"- {text}" for text in MVP_LIMITS]
    return "\n".join(lines) + "\n"


def methods_markdown(state: EngineState) -> str:
    """The reporter's methods text: what ran, in order, and what each claim came to."""
    lines = [
        "# Methods: claims audit (MVP, four curated claims)",
        "",
        (
            "Each claim is a categorical question with curated options and 'none of these'. "
            "Diagnostics are pre-registered Python scripts run locally in a subprocess; outcome "
            "bins are evaluated by code; likelihoods come from the library's stated rows; a "
            "deterministic, blind code referee validates every result before the Bayes update."
        ),
        "",
        "## Diagnostics in run order",
        "",
    ]
    for n, t in enumerate(state.trials, start=1):
        ok = "valid" if t.observation.valid else "invalid"
        lines.append(
            f"{n}. `{t.experiment.id}` ({', '.join(t.experiment.question_ids)}): "
            f"{_bin_label(t)}, {ok}; {key_numbers(t)}; {t.observation.seconds:.1f} s"
        )
    lines += ["", "## Verdicts", ""]
    for c in CLAIMS:
        if c.id not in state.questions:
            continue
        label, h = verdict(state, c.id)
        tail = f" (`{h.answer_key}`, posterior {h.posterior:.3f})" if h is not None else ""
        lines.append(f"- {c.title}: {label}{tail}")
    if state.rejected:
        lines += ["", "## Rejected options", ""]
        lines += [f"- `{r['hypothesis']}`: {r['reason']}" for r in state.rejected]
    return "\n".join(lines) + "\n"
