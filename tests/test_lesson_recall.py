"""Start-of-run recall of a frozen lesson corpus in real Task 9 runs, with fakes only.

No network and no model: the swarm runs on this machine with a recording LLM fake. With no
corpus the prompts, events and config record are as before; with one, every proposer
persona and the delivery planner get their applicable lessons before they are called.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import pytest

from agents import deliverer
from agents.proposer import PROMPTS, ROLES
from core import cli
from core.config import load_config
from core.orchestrator import run
from eval import run_task9_arms as arms
from eval.lessons import freeze_task9
from labs.bixbench3.swarm_lab import build_task9_run
from memory.lessons import (
    DevelopmentEvidence,
    FrozenLessons,
    LessonLedger,
    ReviewedLesson,
    RunLessons,
    format_lessons,
)
from tests.test_task9_wiring import (
    critic_from_lab,
    make_case,
    referee_ok,
    report_plain,
    writer_code,
)

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "eval" / "lessons" / "task9-dev-candidates.json"
BEGIN = "=== BEGIN REVIEWED LESSONS"
TASK = [{"key": "task", "value": "bixbench3-task9"}, {"key": "analysis", "value": "de_from_counts"}]


def lesson(lesson_id: str, requires: list[dict]) -> dict:
    return {
        "id": lesson_id,
        "when": f"When {lesson_id} applies.",
        "mistake": "Skipping the check.",
        "diagnostic": "Run the check.",
        "repair": "Repair before fitting.",
        "exceptions": [],
        "requires": requires,
        "sources": [
            {
                "run_id": "dev-run",
                "case_id": "case-05",
                "split": "dev",
                "evidence_id": "dev-run/events.jsonl#1",
                "kind": "diagnostic",
                "input_hash": "dev-input",
            }
        ],
        "approved": True,
        "reviewed_by": "test-reviewer",
        "reviewed_at": "2026-11-14T20:00:00Z",
    }


def corpus(**overrides) -> FrozenLessons:
    data = {
        "frozen_at": "2026-11-14T21:00:00Z",
        "held_out_case_ids": ["case-01", "case-02"],
        "lessons": [
            lesson("all-readers", TASK),
            lesson("designer-only", [*TASK, {"key": "reader", "value": "designer"}]),
            lesson("other-task", [{"key": "task", "value": "something-else"}]),
        ],
        **overrides,
    }
    return FrozenLessons.model_validate(data)


class RecordingLLM:
    """Proposers return no questions (so no merge call); the planner writes the contract."""

    on_usage = None

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, list[dict]]] = []

    async def structured(self, role, schema, messages, n=1, **_):
        self.calls.append((role, schema.__name__, messages))
        if schema.__name__ == "ProposalBatch":
            return [{"questions": []}]
        if schema.__name__ == "DeliveryPlan":
            return [{"steps": [{"language": "python", "code": writer_code()}]}]
        raise AssertionError(f"unexpected model call for {role}")

    def systems(self, schema: str) -> list[str]:
        return [m[0]["content"] for _, name, m in self.calls if name == schema]


def task9_run(tmp_path: Path, monkeypatch, **cfg_values):
    monkeypatch.delenv("EXA_API_KEY", raising=False)
    monkeypatch.delenv("PAST_API_KEY", raising=False)
    case = make_case(tmp_path / "case")
    cfg = load_config("no_search", runs_dir=str(tmp_path / "runs"), **cfg_values)
    llm = RecordingLLM()
    lab, deps = build_task9_run(cfg, case_dir=case, llm=llm)
    deps.agents.library = lambda brief: []
    deps.agents.search_library = lambda questions: {}
    deps.agents.referee_fn = referee_ok
    deps.agents.critic_fn = critic_from_lab
    deps.agents.report_fn = report_plain
    return cfg, lab, deps, llm


def events(run_dir: Path) -> list[dict]:
    return [json.loads(x) for x in (run_dir / "events.jsonl").read_text().splitlines()]


def saved_corpus(tmp_path: Path, **overrides) -> tuple[Path, FrozenLessons]:
    frozen = corpus(**overrides)
    return frozen.save(tmp_path / "frozen"), frozen


# --- off: nothing changes -----------------------------------------------------------------


def test_without_a_corpus_prompts_events_and_config_are_unchanged(tmp_path, monkeypatch):
    cfg, lab, deps, llm = task9_run(tmp_path, monkeypatch)
    assert deps.lessons is None and deps.agents.lessons is None and lab.lessons is None
    asyncio.run(run(lab, cfg, deps, run_id="r-off"))

    personas = llm.systems("ProposalBatch")
    assert personas == [(PROMPTS / f"{role}.md").read_text(encoding="utf-8") for role in ROLES]
    assert llm.systems("DeliveryPlan") == [deliverer._SYSTEM]
    assert not any(BEGIN in json.dumps(messages) for _, _, messages in llm.calls)
    run_dir = tmp_path / "runs" / "r-off"
    log = events(run_dir)
    assert not [e for e in log if e["type"] == "memory.recalled"]
    config = log[0]["payload"]["config"]
    assert "lessons_corpus" not in config and "lessons_case_id" not in config
    assert "lessons_corpus" not in json.loads((run_dir / "manifest.json").read_text())["config"]
    assert not (run_dir / "lessons").exists()


# --- on: recall before proposals reaches the proposer and designer prompts ---------------


def test_corpus_reaches_every_persona_and_the_delivery_planner(tmp_path, monkeypatch):
    path, frozen = saved_corpus(tmp_path)
    cfg, lab, deps, llm = task9_run(
        tmp_path, monkeypatch, lessons_corpus=str(path), lessons_case_id="case-01"
    )
    assert isinstance(deps.lessons, RunLessons)
    assert deps.agents.lessons is deps.lessons and lab.lessons is deps.lessons
    assert deps.lessons.readers == (*ROLES, "designer")
    assert deps.memory is None  # the corpus is not the run's memory
    asyncio.run(run(lab, cfg, deps, run_id="r-on"))

    personas = llm.systems("ProposalBatch")
    assert len(personas) == len(ROLES)
    for role, system in zip(ROLES, personas, strict=True):
        prompt = (PROMPTS / f"{role}.md").read_text(encoding="utf-8")
        assert system.startswith(prompt + "\n\n" + BEGIN)
        assert "all-readers" in system and "designer-only" not in system
        assert "other-task" not in system
    [planner] = llm.systems("DeliveryPlan")
    assert planner.startswith(deliverer._SYSTEM + "\n\n" + BEGIN)
    assert "all-readers" in planner and "designer-only" in planner and "other-task" not in planner
    for _, _, messages in llm.calls:  # data stays in the user message, lessons do not
        assert BEGIN not in messages[1]["content"]

    run_dir = tmp_path / "runs" / "r-on"
    log = events(run_dir)
    recalled = [e for e in log if e["type"] == "memory.recalled"]
    assert [e["payload"]["reader_role"] for e in recalled] == [*ROLES, "designer"]
    profile_seq = next(e["seq"] for e in log if e["type"] == "profile.done")
    assert all(e["seq"] > profile_seq for e in recalled)
    for e in recalled:
        p = e["payload"]
        assert p["backend"] == "local_lessons" and p["case_id"] == "case-01"
        assert p["corpus_sha256"] == frozen.digest and set(p["authors"]) == {"reporter"}
        designer = p["reader_role"] == "designer"
        assert len(p["evidence_ids"]) == (2 if designer else 1)
    config = log[0]["payload"]["config"]
    assert config["lessons_corpus"] == str(path) and config["lessons_case_id"] == "case-01"

    [db] = list((run_dir / "lessons").rglob("memory.sqlite3"))
    connection = sqlite3.connect(db)
    try:
        audit = dict(
            connection.execute("SELECT operation, count(*) FROM audit GROUP BY operation")
        )
    finally:
        connection.close()
    assert audit == {"lesson.written": 3, "memory.recalled": len(ROLES) + 1}


def test_one_proposer_config_recalls_for_that_persona_only(tmp_path, monkeypatch):
    path, _ = saved_corpus(tmp_path)
    _, _, deps, _ = task9_run(
        tmp_path, monkeypatch, proposers=1, lessons_corpus=str(path), lessons_case_id="case-02"
    )
    assert deps.lessons.readers == (ROLES[0], "designer")


# --- failing loudly -----------------------------------------------------------------------


def test_a_case_outside_the_held_out_cohort_raises(tmp_path, monkeypatch):
    path, _ = saved_corpus(tmp_path)
    with pytest.raises(ValueError, match="held-out cohort"):
        task9_run(tmp_path, monkeypatch, lessons_corpus=str(path), lessons_case_id="case-05")


def test_a_corpus_that_does_not_load_raises(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="Cannot load"):
        task9_run(
            tmp_path,
            monkeypatch,
            lessons_corpus=str(tmp_path / "missing.json"),
            lessons_case_id="case-01",
        )
    path, _ = saved_corpus(tmp_path)
    raw = json.loads(path.read_text())
    raw["manifest"]["lessons"][0]["repair"] = "Edited after the freeze"
    tampered = tmp_path / "tampered.json"
    tampered.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="digest mismatch"):
        task9_run(tmp_path, monkeypatch, lessons_corpus=str(tampered), lessons_case_id="case-01")


@pytest.mark.parametrize(
    "overrides,case_id,message",
    [
        ({"synthetic": True}, "case-01", "synthetic"),
        ({"lessons": []}, "case-01", "no lessons"),
        ({}, None, "declare its case id"),
    ],
)
def test_synthetic_empty_or_undeclared_runs_raise(tmp_path, overrides, case_id, message):
    path, _ = saved_corpus(tmp_path, **overrides)
    with pytest.raises(ValueError, match=message):
        RunLessons(path, case_id, readers=("designer",), context={})


def test_a_case_id_without_a_corpus_raises(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="lessons_corpus is not"):
        task9_run(tmp_path, monkeypatch, lessons_case_id="case-01")


def test_a_preparation_failure_stops_the_run_before_any_proposal(tmp_path, monkeypatch):
    class BrokenLedger(LessonLedger):
        async def flush(self):
            raise TimeoutError("ledger unavailable")

    path, _ = saved_corpus(tmp_path)
    cfg, lab, deps, llm = task9_run(
        tmp_path, monkeypatch, lessons_corpus=str(path), lessons_case_id="case-01"
    )
    deps.lessons.memory_factory = BrokenLedger
    with pytest.raises(TimeoutError):
        asyncio.run(run(lab, cfg, deps, run_id="r-broken"))
    last = events(tmp_path / "runs" / "r-broken")[-1]
    assert last["type"] == "run.error" and last["payload"]["where"] == "lessons"
    assert llm.calls == []
    assert deps.lessons.memory is None  # closed with the lab


def test_lessons_are_not_served_before_the_start_of_run_load(tmp_path):
    path, _ = saved_corpus(tmp_path)
    lessons = RunLessons(path, "case-01", readers=("designer",), context={})
    with pytest.raises(RuntimeError, match="load"):
        lessons.for_role("designer")
    assert format_lessons([]) == ""


# --- the command line and the arms runner -------------------------------------------------


def test_cli_passes_the_corpus_and_case_to_the_run_config(tmp_path, monkeypatch):
    seen = {}

    def stop(cfg, **_):
        seen["cfg"] = cfg
        raise RuntimeError("stop before running")

    monkeypatch.setattr("labs.bixbench3.swarm_lab.build_task9_run", stop)
    argv = ["--lab", "bixbench3", "--case", str(tmp_path), "--lessons", "c.json"]
    with pytest.raises(RuntimeError, match="stop"):
        cli.main([*argv, "--lessons-case-id", "case-01"])
    assert seen["cfg"].lessons_corpus == "c.json"
    assert seen["cfg"].lessons_case_id == "case-01"
    with pytest.raises(SystemExit):
        cli.main(argv)  # no case id
    with pytest.raises(SystemExit):
        cli.main(["--lab", "fake", "--lessons", "c.json", "--lessons-case-id", "case-01"])


def arms_args(**values) -> argparse.Namespace:
    base = {
        "arms": ["swarm", "swarm-lessons"],
        "lessons": None,
        "with_tools": False,
        "runs_dir": Path("runs"),
    }
    return argparse.Namespace(**{**base, "baseline_model": "gpt-5.5", **values})


def test_arms_runner_checks_the_corpus_and_cohort_before_any_run(tmp_path):
    path, frozen = saved_corpus(tmp_path)
    record = arms.check_lessons(arms_args(lessons=path), {"case-01": "m.json"})
    assert record["sha256"] == frozen.digest and record["held_out_case_ids"] == ["case-01", "case-02"]
    assert arms.check_lessons(arms_args(arms=["swarm", "baseline"]), {"case-01": "m"}) is None
    with pytest.raises(SystemExit, match="held-out cohort"):
        arms.check_lessons(arms_args(lessons=path), {"case-01": "m", "case-05": "m"})
    with pytest.raises(SystemExit, match="needs --lessons"):
        arms.check_lessons(arms_args(), {"case-01": "m"})
    with pytest.raises(SystemExit, match="add it to --arms"):
        arms.check_lessons(arms_args(arms=["swarm"], lessons=path), {"case-01": "m"})
    with pytest.raises(SystemExit, match="cannot load"):
        arms.check_lessons(arms_args(lessons=tmp_path / "nope.json"), {"case-01": "m"})


def test_only_the_swarm_lessons_arm_gets_the_corpus(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    commands = {}

    class Done:
        returncode = 0

    def fake_run(command, **_):
        commands[command[command.index("--run-id") + 1]] = command
        return Done()

    monkeypatch.setattr(arms.subprocess, "run", fake_run)
    args = arms_args(lessons=tmp_path / "corpus.json")
    for arm in ("swarm", "swarm-lessons", "baseline"):
        arms.run_arm(arm, "case-01", Path("m.json"), f"b-{arm}", args, tmp_path)
    assert commands["b-swarm-lessons"][-4:] == [
        "--lessons",
        str(tmp_path / "corpus.json"),
        "--lessons-case-id",
        "case-01",
    ]
    assert commands["b-swarm-lessons"][:-4] == [
        "b-swarm-lessons" if c == "b-swarm" else c for c in commands["b-swarm"]
    ]
    assert "--lessons" not in commands["b-swarm"] and "--lessons" not in commands["b-baseline"]
    assert "eval.baseline_agent" in commands["b-baseline"]


def test_paired_table_compares_the_two_swarm_arms_per_case():
    rows = [
        {"case": "case-01", "arm": "swarm", "mean": 0.5},
        {"case": "case-01", "arm": "swarm-lessons", "mean": 0.75},
        {"case": "case-02", "arm": "swarm", "mean": 0.4},
        {"case": "case-02", "arm": "swarm-lessons", "mean": None},
        {"case": "case-03", "arm": "baseline", "mean": 0.9},
    ]
    paired = arms.paired_lessons(rows)
    assert [(p["case"], p["delta_on_minus_off"]) for p in paired] == [
        ("case-01", 0.25),
        ("case-02", -0.4),
    ]


# --- the drafted candidates and the freeze script -----------------------------------------


def approve(document: dict, ids: set[str] | None = None) -> dict:
    for candidate in document["candidates"]:
        if ids is None or candidate["lesson"]["id"] in ids:
            candidate["lesson"].update(
                approved=True, reviewed_by="test-reviewer", reviewed_at="2026-11-14T22:00:00-05:00"
            )
    return document


def test_dev_candidates_are_unapproved_and_become_reviewed_lessons_once_approved():
    document = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    candidates = document["candidates"]
    assert candidates and not any(c["lesson"]["approved"] for c in candidates)
    assert all(c["lesson"]["reviewed_by"] == "" for c in candidates)
    for candidate in approve(document)["candidates"]:
        reviewed = ReviewedLesson.model_validate(candidate["lesson"])
        for source in reviewed.sources:
            assert source.case_id in freeze_task9.DEV_CASES
            assert source.run_id.startswith(f"batch-02-suite-{source.case_id}-")
            assert source.evidence_id.startswith(source.run_id + "/")
            assert isinstance(source, DevelopmentEvidence)
        text = json.dumps(candidate["lesson"])
        assert not any(case in text for case in freeze_task9.HELD_OUT)


def test_freeze_keeps_approved_lessons_and_declares_the_nine_held_out_cases(tmp_path, capsys):
    candidates = tmp_path / "candidates.json"
    document = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    candidates.write_text(json.dumps(document), encoding="utf-8")
    assert freeze_task9.main([str(candidates), "--out", str(tmp_path / "out")]) == 1

    first = document["candidates"][0]["lesson"]["id"]
    candidates.write_text(json.dumps(approve(document, {first})), encoding="utf-8")
    frozen_at = "2026-11-15T03:30:00+00:00"
    code = freeze_task9.main(
        [str(candidates), "--out", str(tmp_path / "out"), "--frozen-at", frozen_at]
    )
    assert code == 0
    printed = capsys.readouterr().out
    path = Path(printed.split("corpus:")[1].split()[0])
    frozen = FrozenLessons.load(path)
    assert f"sha256:   {frozen.digest}" in printed and "left out (not approved)" in printed
    assert [lesson.id for lesson in frozen.lessons] == [first]
    assert frozen.held_out_case_ids == freeze_task9.HELD_OUT and len(frozen.held_out_case_ids) == 9
    assert not set(freeze_task9.HELD_OUT) & set(freeze_task9.DEV_CASES)
    assert frozen.frozen_at == datetime(2026, 11, 15, 3, 30, tzinfo=UTC)
