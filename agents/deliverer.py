"""Delivery planner: turns what the swarm settled into the code that writes the artifacts.

The model writes the analysis code, as the single-agent baseline does, so the two arms
differ in how decisions are made, not in who wrote the pipeline. What the swarm adds is
in the facts it gets: every question, how it was settled, the diagnostic results behind
it (including flagged samples), what stayed unresolved, the critic's findings from the
last round and the last execution error.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from core.schemas import EngineState, Evidence
from memory.lessons import format_lessons

_SYSTEM = """You write the analysis code that produces a study's deliverables in a sandbox.

Environment: Python 3.12 with pandas and numpy, and R with DESeq2, both available. Inputs
are read-only under /data; scratch space is /work; write every deliverable and METHODS.md
under /outputs, using exactly the file names and column names in the contract. There is
no network.

Rules:
- Follow the decisions. A settled question is decided: apply its answer (for example,
  restore swapped samples, drop a duplicated or degraded library, fix a mislabelled cell
  line, strip gene id versions) using the sample ids its diagnostics flagged.
- An unresolved question with `evidence: tested` had diagnostics move its beliefs, so its
  first option is the best supported: use it and say so in METHODS.md.
- An unresolved question with `evidence: untested` was never tested; its option order is
  only the proposers' prior, not evidence. Do not act on it: keep the method's documented
  defaults (for DESeq2: no manual low-count prefilter, its own independent filtering,
  Benjamini-Hochberg padj) or the task's explicit instruction, and say in METHODS.md that
  the question stayed untested and which default you kept.
- Use biological replicates and the method guidance in the task. Keep default DESeq2
  settings unless the task or a decision says otherwise.
- METHODS.md records the analysis, every decision with the diagnostic that settled it,
  what was rejected and what stayed unresolved.
- If an earlier attempt failed or the critic raised findings, fix those specifically.
- Code must run start to finish without interaction in under ten minutes, and must not
  print lines starting with "RESULT:".
Return one to three ordered steps."""


class DeliveryStep(BaseModel):
    language: Literal["r", "python"]
    purpose: str = ""
    code: str = Field(min_length=1)


class DeliveryPlan(BaseModel):
    steps: list[DeliveryStep] = Field(min_length=1, max_length=3)


def decisions(state: EngineState) -> list[dict]:
    """Each question with its options, outcome and the diagnostic results behind it."""
    out = []
    for qid, q in state.questions.items():
        options = sorted(state.options(qid), key=lambda h: -h.posterior)
        trials = [t for t in state.trials if qid in t.experiment.question_ids]
        # A question whose options no valid diagnostic ever touched is ordered only by the
        # proposers' priors. Acting on that order made clean-case runs vary: in batch-02 the
        # untested low-count-filtering question was applied three different ways.
        tested = any(t.observation.valid for t in trials)
        out.append(
            {
                "question": q.text,
                "status": q.status,
                "evidence": "tested" if tested else "untested",
                "options": [
                    {
                        "statement": h.statement,
                        "answer_key": h.answer_key,
                        "posterior": round(h.posterior, 3),
                        "status": h.status,
                    }
                    for h in options
                ],
                "diagnostics": [
                    {
                        "goal": t.experiment.goal,
                        "library": (t.experiment.design or {}).get("diagnostic"),
                        "valid": t.observation.valid,
                        "outcome": t.observation.bin_id,
                        "result": t.observation.value,
                    }
                    for t in trials
                ],
            }
        )
    return out


async def plan_delivery(
    llm,
    state: EngineState,
    *,
    last_error: str | None = None,
    profile: list[dict] | None = None,
    lessons: list[Evidence] | None = None,
) -> list[tuple[str, str]]:
    """The delivery code as ordered ``(language, code)`` steps.

    ``lessons`` are the reviewed lessons the run recalled for the designer at its start;
    in Task 9 the delivery planner designs the analysis code, so it reads them, appended
    to the system prompt as a delimited block. Without lessons the prompt is unchanged.
    """
    brief = state.brief or {}
    findings = [f.model_dump(mode="json") for f in state.findings][-20:]
    payload = {
        "task": brief.get("goal", ""),
        "contract": brief.get("contract", {}),
        "profile": profile or [],
        "decisions": decisions(state),
        "delivery_round": state.delivery_round,
        "critic_findings": findings,
        "last_execution_error": (last_error or "")[-4000:],
    }
    block = format_lessons(lessons or [])
    messages = [
        {"role": "system", "content": f"{_SYSTEM}\n\n{block}" if block else _SYSTEM},
        {"role": "user", "content": json.dumps(payload, default=str)},
    ]
    [plan] = await llm.structured("deliverer", DeliveryPlan, messages)
    plan = DeliveryPlan.model_validate(plan)
    return [(step.language, step.code) for step in plan.steps]
