import asyncio
import json

import pytest
from pydantic import ValidationError

from agents.proposer import LibraryQuestion, MergePlan, Proposal, ProposalBatch, propose
from core.config import RunConfig
from core.events import EventBus
from core.fakes import FakeMemory
from core.schemas import Experiment


def batch(fault=False):
    return ProposalBatch.model_validate(
        {
            "questions": [
                {
                    "text": "Which gene identifier format satisfies the contract?",
                    "kind": "categorical",
                    "impact": 0.8,
                    "options": [
                        {
                            "statement": "Strip versions",
                            "rationale": "Contract asks for unversioned IDs",
                        },
                        {
                            "statement": "Keep versions",
                            "rationale": "Counts use versioned IDs",
                        },
                    ],
                },
                {
                    "text": "Are sample labels consistent with the profile?",
                    "kind": "categorical",
                    "impact": 1.0,
                    "options": [
                        {
                            "statement": "Labels are correct",
                            "rationale": "Use the supplied sheet",
                        },
                        {
                            "statement": "Check swapped labels",
                            "rationale": "Correlation mismatch"
                            if fault
                            else "Verify metadata",
                        },
                    ],
                },
            ]
        }
    )


class Client:
    def __init__(self, fault=False, expected=3, corrupt=False):
        self.batch = batch(fault)
        self.expected = expected
        self.calls = []
        self.ready = asyncio.Event()
        self.corrupt = corrupt

    async def structured(self, role, schema, messages, n=1):
        if schema is ProposalBatch:
            self.calls.append(messages)
            if len(self.calls) == self.expected:
                self.ready.set()
            await asyncio.wait_for(self.ready.wait(), 2)
            return [self.batch.model_copy(deep=True)]
        data = json.loads(messages[1]["content"])
        groups = []
        for index in range(2):
            sources = [source for source in data if source.endswith(f"q{index}")]
            groups.append(
                {
                    "source_ids": sources,
                    "options": [
                        {"source_ids": [f"{s}-h{i}" for s in sources]} for i in range(2)
                    ],
                }
            )
        for source in data:
            if source.startswith("library-"):
                groups.append(
                    {
                        "source_ids": [source],
                        "options": [
                            {"source_ids": [f"{source}-h{i}"]} for i in range(2)
                        ],
                    }
                )
        if self.corrupt:
            groups[0]["options"][0]["source_ids"].append("missing")
        return [MergePlan.model_validate({"questions": groups})]


@pytest.mark.parametrize("fault", [False, True])
@pytest.mark.parametrize("count,null", [(3, True), (1, False)])
def test_clean_and_fault_profiles_keep_distinct_questions(tmp_path, fault, count, null):
    async def scenario():
        bus = EventBus("test", tmp_path)
        await bus.emit("run.started", {})
        client = Client(fault, count)
        result = await propose(
            {"goal": "Task 9 DE tables", "case": "dev" if fault else "clean"},
            [],
            llm=client,
            memory=FakeMemory(),
            bus=bus,
            config=RunConfig(proposers=count, null_hypothesis=null),
        )
        assert len(client.calls) == count
        assert len(result.questions) == 2
        for question in result.questions:
            hypotheses = [h for h in result.hypotheses if h.question_id == question.id]
            assert sum(h.prior for h in hypotheses) == pytest.approx(1)
            assert sum(h.is_null for h in hypotheses) == int(null)
            if null:
                assert hypotheses[-1].prior == 0.15
        events = [
            json.loads(line)
            for line in bus.path.read_text(encoding="utf-8").splitlines()
        ]
        assert {"question.opened", "hypothesis.proposed", "hypothesis.merged"} <= {
            e["type"] for e in events
        }
        assert all(
            "other proposer" not in messages[1]["content"] for messages in client.calls
        )

    asyncio.run(scenario())


def test_invalid_merge_keeps_every_proposal_unmerged(tmp_path):
    """A malformed merge plan no longer ends the run (three batch-03 swarm runs crashed on it)."""

    async def scenario():
        bus = EventBus("bad", tmp_path)
        await bus.emit("run.started", {})
        result = await propose(
            {},
            [],
            llm=Client(corrupt=True),
            memory=FakeMemory(),
            bus=bus,
            config=RunConfig(),
        )
        # 3 proposers x 2 questions, each kept as its own question with both of its options
        assert len(result.questions) == 6
        assert [len(result.provenance[q.id]) for q in result.questions] == [1] * 6
        real = [h for h in result.hypotheses if not h.is_null]
        assert len(real) == 12

    asyncio.run(scenario())


def test_library_diagnostics_follow_merged_question(tmp_path):
    async def scenario():
        bus = EventBus("library", tmp_path)
        await bus.emit("run.started", {})
        entry = LibraryQuestion(
            key="ids",
            proposal=batch().questions[0],
            diagnostics=[
                Experiment(
                    id="old", question_ids=["old"], kind="compute", goal="Check IDs"
                )
            ],
        )
        result = await propose(
            {},
            [],
            llm=Client(),
            memory=FakeMemory(),
            bus=bus,
            config=RunConfig(),
            library=[entry],
        )
        assert len(result.diagnostics) == 1
        assert result.diagnostics[0].question_ids == [result.questions[-1].id]
        assert entry.diagnostics[0].question_ids == ["old"]

    asyncio.run(scenario())


def test_model_source_is_screened_without_execution():
    value = batch().questions[0].model_dump()
    value["kind"] = "model"
    with pytest.raises(ValidationError):
        Proposal.model_validate(value)

    for option in value["options"]:
        option["model_code"] = (
            "def predict(designs, params):\n    return params[:, :1] * designs[:, 0]\n\ndef sample_prior(rng, n):\n    return rng.normal(size=(n, 1))"
        )
    assert Proposal.model_validate(value).kind == "model"
    value["options"][0]["model_code"] = (
        "import os\n" + value["options"][0]["model_code"]
    )
    with pytest.raises(ValidationError):
        Proposal.model_validate(value)


def test_duplicate_options_do_not_multiply_proposer_support(tmp_path):
    class DuplicateClient(Client):
        async def structured(self, role, schema, messages, n=1):
            result = await super().structured(role, schema, messages, n)
            if schema is MergePlan:
                for source in result[0].questions[0].source_ids:
                    result[0].questions[0].options[0].source_ids.append(f"{source}-h2")
            return result

    async def scenario():
        client = DuplicateClient()
        first = client.batch.questions[0]
        first.options.append(first.options[0].model_copy(deep=True))
        bus = EventBus("duplicates", tmp_path)
        await bus.emit("run.started", {})
        result = await propose(
            {}, [], llm=client, memory=FakeMemory(), bus=bus, config=RunConfig()
        )
        real = [
            h
            for h in result.hypotheses
            if h.question_id == result.questions[0].id and not h.is_null
        ]
        assert [h.prior for h in real] == pytest.approx([0.425, 0.425])

    asyncio.run(scenario())


def test_merge_preserves_conflicting_answer_keys(tmp_path):
    class ConflictingClient(Client):
        async def structured(self, role, schema, messages, n=1):
            result = await super().structured(role, schema, messages, n)
            # A different model-proposed deliverable must survive grouping.
            if schema is ProposalBatch and "Bioinformatician" in messages[0]["content"]:
                result[0].questions[0].options[0].answer_key = "alternative"
            return result

    async def scenario():
        bus = EventBus("conflicting", tmp_path)
        await bus.emit("run.started", {})
        result = await propose(
            {},
            [],
            llm=ConflictingClient(),
            memory=FakeMemory(),
            bus=bus,
            config=RunConfig(),
        )
        hypotheses = [
            h for h in result.hypotheses if h.question_id == result.questions[0].id
        ]
        assert len(hypotheses) == 4
        assert {h.answer_key for h in hypotheses} == {None, "alternative"}
        assert sum(h.prior for h in hypotheses) == pytest.approx(1)

    asyncio.run(scenario())


class OmittingClient(Client):
    """A merge model that drops one question and lists another option twice."""

    async def structured(self, role, schema, messages, n=1):
        [result] = await super().structured(role, schema, messages, n)
        if schema is MergePlan:
            first, second = result.questions[0], result.questions[1]
            # Repeat one of the second question's options in its other cluster.
            second.options[1].source_ids.append(second.options[0].source_ids[0])
            result.questions = [second, *result.questions[2:]]  # drop the first question
            first_dropped = first.source_ids
            self.dropped = first_dropped
        return [result]


def test_merge_omissions_are_kept_as_their_own_groups(tmp_path):
    async def scenario():
        bus = EventBus("omit", tmp_path)
        await bus.emit("run.started", {})
        client = OmittingClient()
        result = await propose(
            {}, [], llm=client, memory=FakeMemory(), bus=bus, config=RunConfig()
        )
        texts = [q.text for q in result.questions]
        # Every dropped source survives as its own question; no option is lost.
        assert texts.count("Which gene identifier format satisfies the contract?") == len(
            client.dropped
        )
        assert "Are sample labels consistent with the profile?" in texts
        real = [h for h in result.hypotheses if not h.is_null]
        provenance = [s for h in real for s in result.provenance[h.id]]
        assert len(provenance) == len(set(provenance)) == 12  # 3 roles x 2 questions x 2 options

    asyncio.run(scenario())
