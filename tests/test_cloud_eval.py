"""The cloud evaluation runner's pure parts: spend cap, arm commands, per-run cache, job plans.

No network: nothing here calls Modal or a model.
"""

import argparse
import json
import sys
from pathlib import Path

import pytest

from agents.llm import CACHE_DIR_ENV, LLMConfig
from eval import cloud_jobs
from eval import run_task9_arms as arms
from eval.budget_cap import NOT_RUN_BUDGET, BudgetCap


def args_for(tmp_path: Path, **values) -> argparse.Namespace:
    base = {
        "arms": ["swarm"],
        "lessons": None,
        "with_tools": False,
        "runs_dir": tmp_path / "runs",
        "baseline_model": "gpt-5.5",
        "out": tmp_path / "out",
        "manifest": Path("m.json"),
        "max_parallel": 2,
    }
    return argparse.Namespace(**{**base, **values})


# --- the spend cap --------------------------------------------------------------------------


def test_reservations_count_in_flight_runs_and_stop_at_the_cap():
    cap = BudgetCap(5.0)
    assert cap.reserve("a") and cap.reserve("b")  # 2 + 2 reserved
    assert not cap.reserve("c")  # 2 + 2 + 2 > 5
    assert cap.skipped == ["c"] and cap.stopped
    cap.settle("a", 0.4)
    cap.settle("b", 0.6)
    # Spend is now $1, but the launch has stopped: later runs are recorded, never started.
    assert not cap.reserve("d")
    assert cap.skipped == ["c", "d"]
    assert cap.spent_usd == pytest.approx(1.0) and cap.reserved_usd == 0


def test_a_run_that_fits_exactly_is_allowed_and_unknown_cost_keeps_the_reservation():
    cap = BudgetCap(4.0)
    assert cap.reserve("a")
    cap.settle("a", None)  # no cost record: charged the whole $2
    assert cap.spent_usd == 2.0
    assert cap.reserve("b")  # 2 + 2 == 4
    cap.settle("b", 2.3)  # a run can end slightly over its cap; the real cost counts
    assert cap.spent_usd == pytest.approx(4.3)
    assert not cap.reserve("c")


def test_no_cap_never_refuses_and_a_run_id_is_reserved_once():
    cap = BudgetCap(None)
    for i in range(50):
        assert cap.reserve(f"r{i}")
    with pytest.raises(ValueError, match="already"):
        cap.reserve("r0")


def test_the_ledger_carries_the_cap_across_processes(tmp_path):
    ledger = tmp_path / "budget.json"
    first = BudgetCap(6.0, ledger=ledger)
    assert first.reserve("job1-a")
    first.settle("job1-a", 1.5)
    assert first.reserve("job1-b")  # this process dies with b in flight
    second = BudgetCap(6.0, ledger=ledger)
    # b's cost is unknown, so it is charged in full: 1.5 + 2 spent, 2 more fits, then stop.
    assert second.spent_usd == pytest.approx(3.5) and second.in_flight == {}
    assert second.reserve("job2-a")
    assert not second.reserve("job2-b")
    saved = json.loads(ledger.read_text(encoding="utf-8"))
    assert saved["skipped"] == ["job2-b"] and saved["in_flight"] == {"job2-a": 2.0}
    assert saved["stopped"] is True
    with pytest.raises(ValueError, match="cap"):
        BudgetCap(10.0, ledger=ledger)  # one ledger, one cap


def test_skipped_runs_are_recorded_and_left_out_of_the_means(tmp_path, monkeypatch):
    calls = []

    def fake_run_arm(arm, case, manifest, run_id, args, logs):
        calls.append(run_id)
        return {
            "arm": arm, "case": case, "run_id": run_id, "exit_code": 0, "seconds": 1.0,
            "cost_usd": 1.0, "model_calls": 3, "status": "completed",
        }

    monkeypatch.setattr(arms, "run_arm", fake_run_arm)
    monkeypatch.setattr(arms, "grade", lambda run, args: {**run, "mean": 0.5, "passed": 0.0})
    args = args_for(tmp_path, max_parallel=1)
    args.out.mkdir()
    jobs = [("swarm", "clean", Path("m.json"), f"b-clean-swarm-{i}") for i in range(1, 6)]
    # $5 cap, $2 reserved per run, $1 real cost: runs 1-4 fit, run 5 would need 4 + 2 > 5.
    rows = arms.run_all(jobs, args, tmp_path, BudgetCap(5.0), "abc123")
    assert calls == [f"b-clean-swarm-{i}" for i in range(1, 5)]
    assert [r["status"] for r in rows] == ["completed"] * 4 + [NOT_RUN_BUDGET]
    record = json.loads((args.out / "results.json").read_text(encoding="utf-8"))
    assert record["complete"] is True and record["commit"] == "abc123"
    assert record["summary"]["swarm"]["runs"] == 4
    assert record["summary"]["swarm"]["not_run_budget"] == 1
    assert record["summary"]["swarm"]["mean"] == 0.5  # the skipped run is not a 0
    assert record["budget"]["skipped"] == ["b-clean-swarm-5"]
    assert "not run: budget" in (args.out / "results.md").read_text(encoding="utf-8")


def test_a_cap_too_small_for_one_run_records_every_run_as_not_run(tmp_path, monkeypatch):
    monkeypatch.setattr(arms, "run_arm", lambda *a: pytest.fail("no run may start"))
    args = args_for(tmp_path)
    args.out.mkdir()
    jobs = [("swarm", "clean", Path("m.json"), f"b-{i}") for i in range(3)]
    rows = arms.run_all(jobs, args, tmp_path, BudgetCap(1.0), "abc")
    assert [r["status"] for r in rows] == [NOT_RUN_BUDGET] * 3
    summary = json.loads((args.out / "results.json").read_text(encoding="utf-8"))["summary"]
    assert summary["swarm"]["runs"] == 0 and summary["swarm"]["mean"] is None


# --- arms and the per-run cache --------------------------------------------------------------


def test_each_arm_maps_to_its_command(tmp_path):
    args = args_for(tmp_path, lessons=tmp_path / "corpus.json")
    runs = str(tmp_path / "runs")
    swarm = arms.arm_command("swarm", "case-01", Path("m.json"), "r1", args)
    assert swarm == [
        sys.executable, "-m", "core.cli", "--lab", "bixbench3", "--manifest", "m.json",
        "--runs-dir", runs, "--run-id", "r1",
    ]
    random = arms.arm_command("swarm-random", "case-01", Path("m.json"), "r1", args)
    assert random == [*swarm, "--config", "crux_random_selection"]
    lessons = arms.arm_command("swarm-lessons", "case-01", Path("m.json"), "r1", args)
    assert lessons == [
        *swarm, "--lessons", str(tmp_path / "corpus.json"), "--lessons-case-id", "case-01"
    ]
    baseline = arms.arm_command("baseline", "case-01", Path("m.json"), "r1", args)
    assert baseline[1:3] == ["-m", "eval.baseline_agent"]
    assert baseline[baseline.index("--runs-dir") + 1] == runs
    assert baseline[baseline.index("--model") + 1] == "gpt-5.5"
    assert "--config" not in baseline and "--lessons" not in baseline
    with pytest.raises(ValueError, match="unknown arm"):
        arms.arm_command("swarm-eig", "case-01", Path("m.json"), "r1", args)
    assert "swarm-random" in arms.ARMS


def test_the_random_selection_preset_exists():
    from core.config import load_config

    assert load_config("crux_random_selection").selection == "random"


def test_every_run_gets_its_own_cache_and_no_tool_keys(tmp_path, monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "x")
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    args = args_for(tmp_path)
    one, two = arms.run_env("b-clean-swarm-1", args), arms.run_env("b-clean-swarm-2", args)
    assert Path(one[CACHE_DIR_ENV]) == tmp_path / "runs" / "b-clean-swarm-1" / ".cache" / "llm"
    assert one[CACHE_DIR_ENV] != two[CACHE_DIR_ENV]
    assert "EXA_API_KEY" not in one and one["OPENAI_API_KEY"] == "k"
    assert arms.run_env("r", args_for(tmp_path, with_tools=True))["EXA_API_KEY"] == "x"


def test_the_llm_config_honours_the_cache_env_and_keeps_its_default(monkeypatch):
    monkeypatch.delenv(CACHE_DIR_ENV, raising=False)
    assert LLMConfig().cache_dir == Path("runs/.cache/llm")
    monkeypatch.setenv(CACHE_DIR_ENV, "runs/r7/.cache/llm")
    assert LLMConfig().cache_dir == Path("runs/r7/.cache/llm")
    assert LLMConfig(cache_dir=Path("elsewhere")).cache_dir == Path("elsewhere")


def test_the_runner_passes_the_per_run_cache_to_the_subprocess(tmp_path, monkeypatch):
    seen = {}

    class Done:
        returncode = 0

    def fake_run(command, **kwargs):
        seen[command[command.index("--run-id") + 1]] = kwargs["env"][CACHE_DIR_ENV]
        return Done()

    monkeypatch.setattr(arms.subprocess, "run", fake_run)
    args = args_for(tmp_path)
    for run_id in ("r1", "r2"):
        arms.run_arm("swarm-random", "clean", Path("m.json"), run_id, args, tmp_path)
    assert seen == {
        "r1": str(tmp_path / "runs" / "r1" / ".cache" / "llm"),
        "r2": str(tmp_path / "runs" / "r2" / ".cache" / "llm"),
    }


def test_the_commit_can_be_pinned_where_there_is_no_git(monkeypatch):
    monkeypatch.setenv("CRUX_GIT_COMMIT", "f00d")
    assert arms.git_commit() == "f00d"


# --- cloud launch plans ----------------------------------------------------------------------


def plan(jobs, **values):
    base = {
        "launch_id": "t9-test",
        "commit": "c0ffee",
        "dirty": False,
        "max_total_usd": 30.0,
        "created_at": "2026-11-14T00:00:00+00:00",
    }
    return cloud_jobs.plan_launch(jobs, **{**base, **values})


def test_a_job_becomes_a_runner_invocation_on_the_cloud_paths():
    launch = plan([{"name": "smoke", "cases": "clean", "arms": "swarm,swarm-random"}])
    job = launch["jobs"][0]
    assert job["out"] == "t9-test-smoke" and job["runs"] == 2
    command = cloud_jobs.job_command(job, launch, "py")
    assert command[:3] == ["py", "-m", "eval.run_task9_arms"]

    def value(flag):
        return command[command.index(flag) + 1]

    assert value("--case") == "clean=/evaluator/manifests/task9-clean-v38.json"
    assert command[command.index("--arms") + 1 : command.index("--repeats")] == [
        "swarm", "swarm-random"
    ]
    assert value("--evaluator") == "/evaluator/task9"
    assert value("--grader-repo") == "/opt/BixBench3"
    assert value("--grader-python") == "/opt/grader-venv/bin/python"
    assert value("--out") == "/results/t9-test/t9-test-smoke"
    assert value("--runs-dir") == "/results/t9-test/runs"
    assert value("--max-total-usd") == "30.0"
    assert value("--budget-ledger") == "/results/t9-test/budget.json"
    assert "--lessons" not in command


def test_suite_jobs_lessons_and_validation():
    launch = plan(
        [
            {"name": "main", "cases": "suite", "arms": ["swarm", "baseline"], "repeats": 3},
            {
                "name": "lessons",
                "cases": ["case-02", "case-05"],
                "arms": ["swarm", "swarm-lessons"],
                "lessons": "corpus-v1.json",
                "score_faults": True,
            },
        ]
    )
    main, lessons = launch["jobs"]
    assert main["cases"] == list(cloud_jobs.SUITE) and main["runs"] == 13 * 2 * 3
    command = cloud_jobs.job_command(lessons, launch)
    assert command[command.index("--lessons") + 1] == "/evaluator/lessons/corpus-v1.json"
    faults = cloud_jobs.score_faults_command(lessons, launch)
    assert faults[faults.index("--truth") + 1] == "/evaluator/task9-suite/truth.json"
    assert faults[faults.index("--results") + 1] == "/results/t9-test/t9-test-lessons/results.json"
    bad = [
        ({"name": "x", "cases": "case-14"}, "unknown case"),
        ({"name": "x", "cases": "clean", "arms": "swarm-lessons"}, "go together"),
        ({"name": "x", "cases": "clean", "arms": "swarm", "lessons": "c.json"}, "go together"),
        ({"name": "x y", "cases": "clean"}, "job name"),
        ({"name": "x", "cases": "clean", "arms": "eig"}, "arms"),
        ({"name": "x", "cases": "clean", "speed": 1}, "unknown job keys"),
    ]
    for job, message in bad:
        with pytest.raises(ValueError, match=message):
            plan([job])
    with pytest.raises(ValueError, match="distinct"):
        plan([{"name": "a", "cases": "clean"}, {"name": "a", "cases": "suite"}])
    with pytest.raises(ValueError, match="positive"):
        plan([{"name": "a", "cases": "clean"}], max_total_usd=0)


def test_status_lines_show_finished_runs_and_spend():
    launch = plan([{"name": "smoke", "cases": "clean"}])
    budget = BudgetCap(3.0)
    budget.reserve("t9-test-smoke-clean-swarm-1")
    budget.settle("t9-test-smoke-clean-swarm-1", 1.25)
    results = {
        "smoke": {
            "complete": True,
            "runs": [
                {
                    "run_id": "t9-test-smoke-clean-swarm-1", "status": "completed",
                    "mean": 0.812, "cost_usd": 1.25,
                }
            ],
        }
    }
    state = {"state": "finished", "jobs": {"smoke": {"state": "done"}}}
    text = "\n".join(
        cloud_jobs.status_lines(launch, state, budget.snapshot(), results, "finished")
    )
    assert "$1.25 finished + $0.00 reserved of $3.00 cap" in text
    assert "job smoke [done]: 1/1 runs recorded (results complete)" in text
    assert "t9-test-smoke-clean-swarm-1: completed, score 0.812, cost $1.25" in text
