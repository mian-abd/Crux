import json

from eval import make_charts as mc


def _suite(tmp_path, with_baseline=True):
    """Two fault cases and one clean case; the baseline crashes on case-02."""
    runs = []
    for case, swarm, base in (("case-01", 0.86, 0.57), ("case-02", 0.80, None), ("case-03", 0.83, 0.87)):
        runs.append({"case": case, "arm": "swarm", "run_id": f"{case}-swarm", "status": "ok",
                     "mean": swarm, "artifacts": {"a_degs": swarm}})
        if with_baseline:
            runs.append({"case": case, "arm": "baseline", "run_id": f"{case}-baseline",
                         "status": "error" if base is None else "finished", "mean": base,
                         "artifacts": {} if base is None else {"a_degs": base}})
    return _write(tmp_path / "suite.json", {"runs": runs})


def _write(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _faults(tmp_path, with_baseline=True):
    rows = [{"case": c, "arm": a, "run_id": f"{c}-{a}", "fault": f, "split": "test",
             "verdict": v, "quote": "", "reason": ""}
            for c, f in (("case-01", "sample_swap"), ("case-02", "low_depth"))
            for a, v in (("swarm", "caught"), ("baseline", "missed"))
            if with_baseline or a == "swarm"]
    return _write(tmp_path / "faults.json", rows)


def _calibration(tmp_path):
    methods = {
        m: {s: {"stated": {"log_loss": v + (0.05 if s == "shift" else 0)}}
            for s in ("test", "shift")}
        for m, v in (("library", 0.55), ("sampled", 0.6), ("base", 0.6), ("finetuned", 0.47))
    }
    return _write(tmp_path / "cal.json", {"methods": methods})


STEMS = ("task9_swarm_vs_baseline", "task9_swarm_vs_baseline_per_case", "task9_fault_detection",
         "fault_detection_real_data", "airway_label_swap", "predictor_calibration")


def test_all_charts_written_with_reruns(tmp_path):
    out = tmp_path / "figs"
    reruns = _write(tmp_path / "reruns.json", {"runs": [
        {"case": "case-02", "arm": "baseline", "run_id": "r-case-02", "status": "finished",
         "mean": 0.84, "artifacts": {"a_degs": 0.84}}]})
    rerun_faults = _write(tmp_path / "rerun_faults.json", [
        {"case": "case-02", "arm": "baseline", "run_id": "r-case-02", "fault": "low_depth",
         "split": "test", "verdict": "caught", "quote": "", "reason": ""}])
    made = mc.build([_suite(tmp_path)], _calibration(tmp_path), out, _faults(tmp_path),
                    [reruns], rerun_faults)
    names = {p.name for p in made}
    for stem in STEMS:
        for ext in ("png", "svg"):
            assert f"{stem}.{ext}" in names
            assert (out / f"{stem}.{ext}").stat().st_size > 0


def test_swarm_only_results_work(tmp_path):
    out = tmp_path / "figs"
    mc.build([_suite(tmp_path, with_baseline=False)], _calibration(tmp_path), out,
             _faults(tmp_path, with_baseline=False))
    assert (out / "task9_swarm_vs_baseline.png").is_file()
    assert (out / "task9_fault_detection.png").is_file()


def test_missing_inputs_are_skipped(tmp_path, capsys):
    out = tmp_path / "figs"
    made = mc.build([tmp_path / "nope.json"], tmp_path / "nope_cal.json", out,
                    tmp_path / "nope_faults.json")
    printed = capsys.readouterr().out
    assert "skipped the task9 charts" in printed
    assert "skipped predictor_calibration" in printed
    assert not (out / "task9_swarm_vs_baseline.png").exists()
    assert (out / "fault_detection_real_data.png").is_file()
    assert len(made) == 4


def test_crash_and_case_names():
    assert mc._crashed({"status": "error", "mean": 0.5})
    assert mc._crashed({"status": "finished", "mean": None})
    # A spend-limited run that was graded is not a failure.
    assert not mc._crashed({"status": "spend_limit", "mean": 0.84})
    names = mc._case_names({"case-09": "gene_version", "case-01": "label_inversion",
                            "case-04": "label_inversion", "case-07": "sample_swap"})
    assert list(names.values()) == ["Sample swap 1", "Label inversion 1", "Label inversion 2",
                                    "Gene version 1"]
    assert names["case-04"] == "Label inversion 2"


def test_hardcoded_totals():
    cells = [e for v in mc.FAULT_DETECTION.values() for e in v if e]
    assert (sum(c for c, _ in cells), sum(p for _, p in cells)) == (26, 30)
