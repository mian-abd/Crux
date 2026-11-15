from pathlib import Path

import numpy as np
import pytest

from eval import heldout_summary as hs

BATCH04 = Path(__file__).resolve().parents[1] / "eval" / "results" / "task9_batch04"


def test_it_reproduces_the_published_batch_04_numbers():
    runs, faults = hs.load(BATCH04)
    s = hs.summarise(runs, faults)
    assert s["cases"] == 13 and s["fault_cases"] == 12
    assert round(s["mean"]["swarm"], 3) == 0.811 and round(s["mean"]["baseline"], 3) == 0.608
    assert round(s["paired_diff"], 3) == 0.203
    lo, hi = s["paired_ci"]
    assert (round(lo, 3), round(hi, 3)) == (0.048, 0.382)
    assert s["faults"]["swarm"] == {"caught": 12}
    assert s["faults"]["baseline"] == {"caught": 3, "noticed": 2, "missed": 7}


def test_crashed_or_ungraded_runs_score_zero_but_capped_runs_count():
    assert hs.run_score({"status": "error", "mean": 0.9}) == 0.0
    assert hs.run_score({"status": "finished", "mean": None}) == 0.0
    assert hs.run_score({"status": "spend_limit", "mean": 0.7}) == pytest.approx(0.7)


def test_suites_are_told_apart_by_case_prefix():
    assert hs.suite_of("h45-case-03") == "h45"
    assert hs.suite_of("case-03") == "seed43"


def test_the_bootstrap_is_seeded():
    values = np.array([0.1, -0.2, 0.3, 0.0, 0.5])
    assert hs.bootstrap_mean_ci(values) == hs.bootstrap_mean_ci(values)
