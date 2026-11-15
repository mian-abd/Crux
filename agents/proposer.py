"""Independent scientific proposals and validated, provenance-preserving merging."""

import asyncio
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from core.config import RunConfig
from core.events import EventBus
from core.interfaces import LLM, Memory
from core.model_sandbox import validate_model_source
from core.schemas import Evidence, Experiment, Hypothesis, Question
from memory.lessons import format_lessons

ROLES = ("statistician", "bioinformatician", "sceptic")
PROMPTS = Path(__file__).parent / "prompts"


class Option(BaseModel):
    statement: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    answer_key: str | None = None
    model_code: str | None = None


class Proposal(BaseModel):
    text: str = Field(min_length=1)
    kind: Literal["categorical", "model"]
    impact: float = Field(ge=0, le=1)
    options: list[Option] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def executable_options(self):
        if self.kind == "model":
            for option in self.options:
                if not option.model_code:
                    raise ValueError("Model options need predict() and sample_prior()")
                validate_model_source(option.model_code)
        return self


class ProposalBatch(BaseModel):
    questions: list[Proposal]


class OptionGroup(BaseModel):
    source_ids: list[str] = Field(min_length=1)


class QuestionGroup(BaseModel):
    source_ids: list[str] = Field(min_length=1)
    options: list[OptionGroup] = Field(min_length=2)


class MergePlan(BaseModel):
    questions: list[QuestionGroup]


class LibraryQuestion(BaseModel):
    """DU-42 supplies a stable key, question, and ready diagnostic templates."""

    key: str
    proposal: Proposal
    diagnostics: list[Experiment] = Field(default_factory=list)


class Proposals(BaseModel):
    questions: list[Question] = Field(default_factory=list)
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    diagnostics: list[Experiment] = Field(default_factory=list)
    provenance: dict[str, list[str]] = Field(default_factory=dict)


def _complete_plan(plan: MergePlan, sources: dict, options: dict) -> MergePlan:
    """Keep the merge model's grouping, but never lose a source.

    Real merge calls sometimes leave out a question or an option, or list one twice (the
    first real Task 9 run failed on exactly this). A repeated reference keeps its first
    place. A question left out becomes its own group; an option left out becomes its own
    cluster in its question's group. References to unknown sources, or to another
    question's options, are kept so that ``propose`` still rejects them.
    """
    seen_questions: set[str] = set()
    seen_options: set[str] = set()
    groups: list[tuple[list[str], list[OptionGroup]]] = []
    for group in plan.questions:
        question_ids = [s for s in group.source_ids if s not in seen_questions]
        if not question_ids:
            continue
        seen_questions.update(question_ids)
        clusters = []
        for cluster in group.options:
            option_ids = [o for o in cluster.source_ids if o not in seen_options]
            if option_ids:
                seen_options.update(option_ids)
                clusters.append(OptionGroup(source_ids=option_ids))
        groups.append((question_ids, clusters))
    for source in sources:
        if source not in seen_questions:
            groups.append(([source], []))
            seen_questions.add(source)
    owner = {q: i for i, (question_ids, _) in enumerate(groups) for q in question_ids}
    for option_id, (source, _role, _option) in options.items():
        if option_id not in seen_options:
            groups[owner[source]][1].append(OptionGroup(source_ids=[option_id]))
            seen_options.add(option_id)
    return MergePlan.model_construct(
        questions=[
            QuestionGroup.model_construct(source_ids=q, options=c) for q, c in groups
        ]
    )


async def propose(
    brief: dict,
    profile: list[Evidence],
    *,
    llm: LLM,
    memory: Memory,
    bus: EventBus,
    config: RunConfig,
    library: list[LibraryQuestion] | None = None,
    lessons: dict[str, list[Evidence]] | None = None,
) -> Proposals:
    """Return merged questions after independent role calls and one merge call.

    Local source IDs encode role and position. The merge model can group existing
    IDs, while code owns IDs, content, provenance, and prior normalization.
    Call once per proposal round. Event IDs include the current event sequence.
    ``lessons`` maps a proposer role to the reviewed lessons it recalled before this round;
    they are appended to that role's system prompt as a delimited block. Without lessons
    for a role its prompt is unchanged, and the merge prompt never gets lessons.
    """
    roles = ROLES[: config.proposers]

    async def independent(role):
        evidence = await memory.recall(brief.get("goal", ""), bus.run_id, role)
        context = {
            "brief": brief,
            "profile": [ev.model_dump() for ev in profile],
            "recalled": [ev.model_dump() for ev in evidence],
        }
        system = (PROMPTS / f"{role}.md").read_text(encoding="utf-8")
        block = format_lessons((lessons or {}).get(role, []))
        if block:
            system = f"{system}\n\n{block}"
        [batch] = await llm.structured(
            "proposer",
            ProposalBatch,
            [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(context)},
            ],
        )
        return role, ProposalBatch.model_validate(batch)

    batches = await asyncio.gather(*(independent(role) for role in roles))
    sources: dict[str, tuple[str, Proposal]] = {}
    options: dict[str, tuple[str, str, Option]] = {}
    library_entries = {}
    for role, batch in batches:
        for index, question in enumerate(batch.questions):
            sources[f"{role}-q{index}"] = (role, question)
    for entry in library or []:
        source = f"library-{entry.key}"
        if source in sources:
            raise ValueError("Duplicate library key")
        sources[source] = ("library", entry.proposal)
        library_entries[source] = entry
    for source, (role, question) in sources.items():
        for index, option in enumerate(question.options):
            options[f"{source}-h{index}"] = (source, role, option)
    if not sources:
        return Proposals()
    data = {
        source: {
            "role": role,
            **question.model_dump(),
            "options": [
                {"source_id": f"{source}-h{i}", **option.model_dump()}
                for i, option in enumerate(question.options)
            ],
        }
        for source, (role, question) in sources.items()
    }
    [raw_plan] = await llm.structured(
        "proposer",
        MergePlan,
        [
            {
                "role": "system",
                "content": (PROMPTS / "merge.md").read_text(encoding="utf-8"),
            },
            {"role": "user", "content": json.dumps(data)},
        ],
    )
    plan = _complete_plan(MergePlan.model_validate(raw_plan), sources, options)
    used_questions, used_options = [], []
    for group in plan.questions:
        if any(source not in sources for source in group.source_ids):
            raise ValueError("Merge references unknown question")
        if len({sources[source][1].kind for source in group.source_ids}) != 1:
            raise ValueError("Cannot merge categorical and model questions")
        compatible = []
        for cluster in group.options:
            if any(
                source not in options or options[source][0] not in group.source_ids
                for source in cluster.source_ids
            ):
                raise ValueError("Merge option belongs to another question")
            # Preserve distinct deliverables or implementations if the merge
            # model groups them together. Never discard an original option.
            partitions = {}
            for source in cluster.source_ids:
                option = options[source][2]
                key = (option.answer_key, option.model_code)
                partitions.setdefault(key, []).append(source)
            compatible.extend(
                OptionGroup(source_ids=ids) for ids in partitions.values()
            )
            used_options.extend(cluster.source_ids)
        group.options = compatible
        used_questions.extend(group.source_ids)
    if sorted(used_questions) != sorted(sources) or sorted(used_options) != sorted(
        options
    ):
        raise ValueError("Merge must include every source exactly once")

    result = Proposals()
    # Build and validate the entire result before publishing any proposal events.
    prefix = f"proposal-{len(bus.path.read_bytes().splitlines()) if bus.path.exists() else 0}"
    for index, group in enumerate(plan.questions):
        qid = f"{prefix}-q{index}"
        first = sources[group.source_ids[0]][1]
        result.questions.append(
            Question(
                id=qid,
                text=first.text,
                kind=first.kind,
                impact=max(sources[s][1].impact for s in group.source_ids),
                raised_by=",".join(sorted({sources[s][0] for s in group.source_ids})),
            )
        )
        result.provenance[qid] = group.source_ids
        supports = [
            len({options[s][1] for s in cluster.source_ids if options[s][1] in roles})
            for cluster in group.options
        ]
        total = sum(support + 1 for support in supports)
        mass = 0.85 if config.null_hypothesis else 1.0
        for position, (cluster, support) in enumerate(
            zip(group.options, supports, strict=True)
        ):
            option = options[cluster.source_ids[0]][2]
            hid = f"{qid}-h{position}"
            prior = mass * (support + 1) / total
            result.hypotheses.append(
                Hypothesis(
                    id=hid,
                    question_id=qid,
                    **option.model_dump(),
                    author=",".join(
                        sorted({options[s][1] for s in cluster.source_ids})
                    ),
                    prior=prior,
                    posterior=prior,
                )
            )
            result.provenance[hid] = cluster.source_ids
        if config.null_hypothesis:
            result.hypotheses.append(
                Hypothesis(
                    id=f"{qid}-h0-null",
                    question_id=qid,
                    statement="None of these",
                    author="engine",
                    rationale="Allow for missing explanations.",
                    is_null=True,
                    prior=0.15,
                    posterior=0.15,
                )
            )
        for source in group.source_ids:
            if source in library_entries:
                for i, diagnostic in enumerate(library_entries[source].diagnostics):
                    result.diagnostics.append(
                        diagnostic.model_copy(
                            update={
                                "id": f"{qid}-{source}-diagnostic-{i}",
                                "question_ids": [qid],
                            },
                            deep=True,
                        )
                    )

    for question in result.questions:
        await bus.emit(
            "question.opened", {"question": question.model_dump(mode="json")}
        )
        hypotheses = [h for h in result.hypotheses if h.question_id == question.id]
        raw_ids = {}
        for hypothesis in hypotheses:
            for source in result.provenance.get(hypothesis.id, []):
                raw_id = f"{prefix}-{source}"
                raw_ids[source] = raw_id
                raw = Hypothesis(
                    id=raw_id,
                    question_id=question.id,
                    **options[source][2].model_dump(),
                    author=options[source][1],
                    prior=0,
                    posterior=0,
                )
                await bus.emit(
                    "hypothesis.proposed",
                    {
                        "hypothesis": raw.model_dump(mode="json"),
                        "pre_merge": True,
                    },
                )
        for hypothesis in hypotheses:
            await bus.emit(
                "hypothesis.proposed",
                {"hypothesis": hypothesis.model_dump(mode="json")},
            )
            if not hypothesis.is_null:
                sources_for_option = result.provenance[hypothesis.id]
                await bus.emit(
                    "hypothesis.merged",
                    {
                        "question_id": question.id,
                        "kept": hypothesis.id,
                        "merged": [raw_ids[s] for s in sources_for_option],
                        "source_ids": sources_for_option,
                        "priors": {h.id: h.prior for h in hypotheses},
                    },
                )
    return result
