"""The sampled predictor switches to one joint call when per-option sampling costs too much."""

from __future__ import annotations

import asyncio

import pytest

from agents.predictor import BinChoice, JointChoice, OptionBin, SampledPredictor
from core.schemas import Experiment, Hypothesis, OutcomeBin


def experiment() -> Experiment:
    return Experiment(
        id="search-filtering",
        question_ids=["q"],
        kind="search",
        goal="What does the DESeq2 documentation say about filtering?",
        query="DESeq2 independent filtering default",
        bins=[
            OutcomeBin(
                id="builtin", description="independent filtering", rule="a == 1"
            ),
            OutcomeBin(id="manual", description="manual pre-filter", rule="a == 2"),
            OutcomeBin(id="none", description="nothing found", rule="a == 0"),
        ],
    )


def options(k: int) -> list[Hypothesis]:
    return [
        Hypothesis(
            id=f"h{i}",
            question_id="q",
            statement=f"option {i}",
            author="proposer",
            rationale="-",
            prior=1.0,
            posterior=1.0,
        )
        for i in range(k)
    ]


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[tuple[str, type, int]] = []

    async def structured(self, role, schema, messages, n=1, **_):
        self.calls.append((role, schema, n))
        if schema is JointChoice:
            return [
                JointChoice(
                    predictions=[
                        OptionBin(option_id="h0", bin_id="builtin", confidence=0.8),
                        OptionBin(option_id="h1", bin_id="manual", confidence=0.6),
                        OptionBin(option_id="h2", bin_id="bogus", confidence=0.9),
                    ]
                )
            ]
        return [BinChoice(bin_id="builtin") for _ in range(n)]


def test_many_options_use_one_joint_call():
    llm = FakeLLM()
    table = asyncio.run(
        SampledPredictor(llm, n=8).predict(experiment(), options(3), "ctx")
    )
    assert [(role, schema) for role, schema, _ in llm.calls] == [
        ("predictor", JointChoice)
    ]
    for row in table.values():
        assert sum(row.values()) == pytest.approx(1.0) and min(row.values()) > 0
    assert max(table["h0"], key=table["h0"].get) == "builtin"
    assert max(table["h1"], key=table["h1"].get) == "manual"
    assert table["h2"] == pytest.approx(
        {b: 1 / 3 for b in ("builtin", "manual", "none")}
    )


def test_few_options_still_sample():
    llm = FakeLLM()
    asyncio.run(SampledPredictor(llm, n=4).predict(experiment(), options(2), "ctx"))
    assert [schema for _, schema, _ in llm.calls] == [BinChoice, BinChoice]
    assert all(n == 4 for _, _, n in llm.calls)
