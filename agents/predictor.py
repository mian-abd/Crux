"""Neutral predictor: P(outcome bin | option) for each experiment.

Stand-in until DU-10's predictor lands; it keeps the ``Predictor.predict`` interface, so the
swap is one line in the wiring.

* Library rows. A library diagnostic carries ``design["exact"]`` (an option fully
  determines the bin) or ``design["stated"]`` (rows measured on synthetic and real data),
  both ``{answer_key: {bin_id: p}}``. Options with a matching ``answer_key`` get that row,
  floored by ``LIBRARY_FLOOR`` so no outcome is impossible: no model call. Without the
  floor, an outcome a row calls impossible (for example "unclear" on real data) would
  reject every real option at once.
* Sampled rows. For every other option the predictor model is asked ``n`` times, blind to
  every other option, which bin the experiment will land in if that option is true. The
  counts become probabilities with ``core.scoring.likelihood_from_samples`` (add-half
  smoothing plus an epsilon floor, so no bin is ever impossible).
"""

from __future__ import annotations

import asyncio
import json

from pydantic import BaseModel, Field

from core import scoring
from core.schemas import Experiment, Hypothesis

_SYSTEM = """You predict the outcome of one pre-registered diagnostic, assuming one stated
option is true. You see the diagnostic's goal, its code and its outcome bins. Answer with
the id of the single bin the result will most likely land in, and one short reason.
Reason from what the code computes; do not assume the option is likely or unlikely."""


LIBRARY_FLOOR = 0.02


class BinChoice(BaseModel):
    bin_id: str = Field(min_length=1)
    reason: str = ""


def diagnostic_spec(exp: Experiment) -> dict:
    return {
        "goal": exp.goal,
        "language": exp.language,
        "code": exp.code,
        "query": exp.query,
        "bins": [
            {"id": b.id, "description": b.description, "rule": b.rule}
            for b in exp.bins
        ],
    }


def exact_row(
    exp: Experiment, hypothesis: Hypothesis, *, table_key: str = "exact"
) -> dict[str, float] | None:
    """The library's row for this option (``exact`` by default), renormalised to the bins."""
    table = (exp.design or {}).get(table_key) or {}
    row = table.get(hypothesis.answer_key or "")
    if not isinstance(row, dict):
        return None
    bins = [b.id for b in exp.bins]
    values = {b: float(row.get(b, 0.0)) for b in bins}
    total = sum(values.values())
    if total <= 0 or any(v < 0 for v in values.values()):
        return None
    return {b: v / total for b, v in values.items()}


def library_row(
    exp: Experiment, hypothesis: Hypothesis, *, floor: float = LIBRARY_FLOOR
) -> dict[str, float] | None:
    """The exact row, else the measured (stated) row, mixed with a uniform floor."""
    row = exact_row(exp, hypothesis) or exact_row(exp, hypothesis, table_key="stated")
    if row is None:
        return None
    return {b: (1 - floor) * p + floor / len(row) for b, p in row.items()}


class OptionBin(BaseModel):
    option_id: str
    bin_id: str
    confidence: float = Field(ge=0.0, le=1.0)


class JointChoice(BaseModel):
    predictions: list[OptionBin]


_JOINT_SYSTEM = """You predict the outcome of one pre-registered diagnostic under each of several
competing options. For every option, assume that option alone is true and give the id of the bin
the result will most likely land in, with your confidence (0-1) that it lands there. Reason from
what the diagnostic measures; do not assume any option is likely or unlikely."""


class SampledPredictor:
    """Library rows first; then n samples per option, or one joint call when that is cheaper.

    Sampling costs ``n`` model calls per option. When ``options * n`` would exceed
    ``max_calls_per_experiment`` (for example a search diagnostic matched to a question with
    five proposer options), one joint call predicts every remaining option at once: each option
    gets its predicted bin with the stated confidence, the rest spread evenly, then the same
    epsilon floor. On the first real runs with search on, per-option sampling spent a Task 9
    run's whole 40-call budget before a single experiment ran.
    """

    def __init__(
        self, llm, *, n: int = 8, eps: float = 0.1, max_calls_per_experiment: int = 8
    ) -> None:
        self.llm = llm
        self.n = n
        self.eps = eps
        self.max_calls_per_experiment = max_calls_per_experiment

    async def predict(
        self, exp: Experiment, hypotheses: list[Hypothesis], context: str
    ) -> dict[str, dict[str, float]]:
        bins = [b.id for b in exp.bins]
        table: dict[str, dict[str, float]] = {}
        sampled: list[Hypothesis] = []
        for h in hypotheses:
            row = library_row(exp, h)
            if row is not None:
                table[h.id] = row
            else:
                sampled.append(h)
        if sampled and len(sampled) * self.n > self.max_calls_per_experiment:
            table.update(await self._joint(exp, sampled, context))
            return table
        rows = await asyncio.gather(*(self._sample(exp, h, context) for h in sampled))
        for h, counts in zip(sampled, rows, strict=True):
            table[h.id] = scoring.likelihood_from_samples(
                {b: counts.get(b, 0) for b in bins}, len(bins), self.eps
            )
        return table

    async def _joint(
        self, exp: Experiment, options: list[Hypothesis], context: str
    ) -> dict[str, dict[str, float]]:
        bins = [b.id for b in exp.bins]
        messages = [
            {"role": "system", "content": _JOINT_SYSTEM},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "options": [{"option_id": h.id, "statement": h.statement} for h in options],
                        "diagnostic": diagnostic_spec(exp),
                        "context": context[:4000],
                    }
                ),
            },
        ]
        [choice] = await self.llm.structured("predictor", JointChoice, messages)
        picks = {p.option_id: p for p in JointChoice.model_validate(choice).predictions}
        out = {}
        for h in options:
            pick = picks.get(h.id)
            if pick is None or pick.bin_id not in bins:
                row = {b: 1 / len(bins) for b in bins}
            else:
                rest = (1 - pick.confidence) / max(len(bins) - 1, 1)
                row = {b: (pick.confidence if b == pick.bin_id else rest) for b in bins}
            out[h.id] = {b: (1 - self.eps) * p + self.eps / len(bins) for b, p in row.items()}
        return out

    async def _sample(
        self, exp: Experiment, h: Hypothesis, context: str
    ) -> dict[str, int]:
        messages = [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "assume_true": h.statement,
                        "diagnostic": diagnostic_spec(exp),
                        "context": context[:4000],
                    }
                ),
            },
        ]
        choices = await self.llm.structured("predictor", BinChoice, messages, n=self.n)
        valid = {b.id for b in exp.bins}
        counts: dict[str, int] = {}
        for choice in choices:
            bin_id = BinChoice.model_validate(choice).bin_id
            if bin_id in valid:
                counts[bin_id] = counts.get(bin_id, 0) + 1
        return counts
