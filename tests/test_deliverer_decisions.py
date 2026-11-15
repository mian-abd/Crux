"""The delivery planner learns which unresolved questions any diagnostic actually tested."""

from __future__ import annotations

from agents.deliverer import _SYSTEM, decisions
from core.schemas import (
    EngineState,
    Experiment,
    Hypothesis,
    Observation,
    OutcomeBin,
    Question,
    Trial,
)


def _state() -> EngineState:
    bins = [OutcomeBin(id="a", description="a", rule="x == 1"),
            OutcomeBin(id="b", description="b", rule="x == 0")]
    questions = {
        "q-filter": Question(id="q-filter", text="Filter low counts?", kind="categorical",
                             status="unresolved", raised_by="statistician"),
        "q-labels": Question(id="q-labels", text="Labels inverted?", kind="categorical",
                             status="unresolved", raised_by="library"),
        "q-dup": Question(id="q-dup", text="Duplicate?", kind="categorical",
                          status="unresolved", raised_by="library"),
    }
    hypotheses = {
        f"{q}-h{i}": Hypothesis(id=f"{q}-h{i}", question_id=q, statement=f"{q} option {i}",
                                author="proposer", rationale="-", prior=0.5, posterior=0.5)
        for q in questions for i in (0, 1)
    }

    def trial(qid: str, valid: bool) -> Trial:
        exp = Experiment(id=f"exp-{qid}", question_ids=[qid], kind="compute", goal="g",
                         code="print(1)", bins=bins)
        return Trial(experiment=exp, observation=Observation(experiment_id=exp.id, valid=valid,
                                                             bin_id="a" if valid else None))

    return EngineState(run_id="r", run_dir="runs/r", lab="bixbench3", questions=questions,
                       hypotheses=hypotheses,
                       trials=[trial("q-labels", True), trial("q-dup", False)])


def test_evidence_marks_tested_and_untested_questions():
    out = {d["question"]: d["evidence"] for d in decisions(_state())}
    assert out == {
        "Filter low counts?": "untested",  # no diagnostic at all
        "Labels inverted?": "tested",  # a valid diagnostic moved its beliefs
        "Duplicate?": "untested",  # only an invalid run: nothing was learned
    }


def test_prompt_keeps_defaults_for_untested_questions():
    assert "evidence: untested" in _SYSTEM and "documented" in _SYSTEM
    assert "evidence: tested" in _SYSTEM
    assert "If a question\n  is unresolved, use the top option" not in _SYSTEM
