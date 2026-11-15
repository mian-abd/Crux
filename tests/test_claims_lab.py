"""The claims lab (MVP, four curated DESeq2 claims): library, diagnostics, referee, run."""

from __future__ import annotations

import ast
import asyncio
import hashlib
import itertools
import json
from pathlib import Path

import pytest

from agents.predictor import SampledPredictor
from core import events as E
from core.cli import main as cli_main
from core.config import load_config
from core.fakes_engine import FakeLab, fake_deps
from core.orchestrator import run
from core.replay import replay_check
from core.schemas import Artifact, Observation, eval_rule
from labs.claims import library
from labs.claims.agents import ClaimsAgents, code_referee, rule_names
from labs.claims.lab import ClaimsLab
from labs.claims.report import VERDICTS
from labs.claims.source import EXCERPT, source_payload

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "runs" / "demo" / "claims_deseq2.jsonl"
DIAGNOSTICS = [(c, d) for c in library.CLAIMS for d in c.diagnostics]
IDS = [d.name for _, d in DIAGNOSTICS]

# The bin each diagnostic's code lands in with its fixed seed.
EXPECTED_BIN = {
    "nb_variance_symbolic": "alpha_form",
    "nb_variance_montecarlo": "alpha_form",
    "wald_pergene": "anti_conservative",
    "wald_known": "calibrated",
    "wald_pergene_vs_moderated": "gap_closes",
    "bh_fdr_sim": "within_bound",
    "bh_fdr_sweep": "none_above_bound",
    "bh_fwer_sim": "far_exceeds",
    "bh_fwer_counterexample": "clear_counterexample",
}

# How each claim ends in the recorded run.
SETTLED = {
    "claim-nb-variance": "holds",
    "claim-wald-calibration": "holds_if",
    "claim-bh-fdr": "holds",
}


def load_events(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


# --- library ------------------------------------------------------------------------------


def _probes(rules: list[str]) -> dict[str, list]:
    """Candidate values per result key: around every numeric threshold, or both booleans."""
    numeric: dict[str, set[float]] = {}
    for rule in rules:
        for node in ast.walk(ast.parse(rule, mode="eval")):
            if not isinstance(node, ast.Compare):
                continue
            operands = [node.left, *node.comparators]
            consts = [
                o.value
                for o in operands
                if isinstance(o, ast.Constant) and isinstance(o.value, (int, float))
            ]
            for o in operands:
                if isinstance(o, ast.Name):
                    numeric.setdefault(o.id, set()).update(consts)
    probes: dict[str, list] = {}
    for name in rule_names(rules):
        if name in numeric:
            values = {-1.0, 0.0, 1e6}
            for c in numeric[name]:
                values |= {c - 1e-6, float(c), c + 1e-6}
            probes[name] = sorted(values)
        else:
            probes[name] = [True, False]
    return probes


@pytest.mark.parametrize(("claim", "diagnostic"), DIAGNOSTICS, ids=IDS)
def test_bins_are_exhaustive_and_exclusive(claim, diagnostic) -> None:
    rules = [rule for _, _, rule in diagnostic.bins]
    probes = _probes(rules)
    names = list(probes)
    for combo in itertools.product(*(probes[n] for n in names)):
        value = dict(zip(names, combo, strict=True))
        matched = [b for b, _, rule in diagnostic.bins if eval_rule(rule, value)]
        assert len(matched) == 1, (diagnostic.name, value, matched)


@pytest.mark.parametrize(("claim", "diagnostic"), DIAGNOSTICS, ids=IDS)
def test_stated_rows_are_valid_and_separate_options(claim, diagnostic) -> None:
    keys = {o.answer_key for o in claim.options}
    bins = [b for b, _, _ in diagnostic.bins]
    assert keys <= set(library.ANSWER_KEYS)
    assert set(diagnostic.stated) == keys
    for row in diagnostic.stated.values():
        assert set(row) == set(bins)
        assert all(p >= 0 for p in row.values())
        assert sum(row.values()) == pytest.approx(1.0)
    rows = list(diagnostic.stated.values())
    tv = max(0.5 * sum(abs(a[b] - c[b]) for b in bins) for a, c in itertools.combinations(rows, 2))
    assert tv >= 0.05  # the orchestrator's relevance bar
    assert diagnostic.est_cost_s > 0


def test_library_questions_options_and_experiments() -> None:
    questions, hypotheses = library.questions()
    assert [q.id for q in questions] == [c.id for c in library.CLAIMS]
    assert len(questions) == 4
    for q in questions:
        options = [h for h in hypotheses if h.question_id == q.id]
        assert 2 <= len(options) <= 3
        assert not any(h.is_null for h in options)
        experiments = library.diagnostics_for(q.id)
        assert len(experiments) >= 2
        for exp in experiments:
            assert exp.question_ids == [q.id] and exp.kind == "compute"
            assert exp.code and "from _common import" not in exp.code
            assert "RESULT: " in exp.code
    assert library.diagnostics_for("unknown") == []


def test_predictor_uses_library_rows_without_a_model() -> None:
    questions, hypotheses = library.questions()
    predictor = SampledPredictor(None)  # a model call would fail on None
    for q in questions:
        options = [h for h in hypotheses if h.question_id == q.id]
        for exp in library.diagnostics_for(q.id):
            table = asyncio.run(predictor.predict(exp, options, ""))
            assert set(table) == {h.id for h in options}
            for row in table.values():
                assert sum(row.values()) == pytest.approx(1.0)
                assert min(row.values()) > 0


# --- source event -----------------------------------------------------------------------


def test_claims_source_payload_shape() -> None:
    payload = source_payload()
    assert set(payload) == {"title", "citation", "url", "license", "excerpt", "claims"}
    assert payload["citation"] == "Love, Huber & Anders (2014) Genome Biology 15:550"
    assert payload["url"] == "https://doi.org/10.1186/s13059-014-0550-8"
    assert payload["license"] == "CC BY 4.0"
    assert payload["excerpt"] == EXCERPT and len(EXCERPT) < 600
    assert [c["question_id"] for c in payload["claims"]] == [c.id for c in library.CLAIMS]
    for item in payload["claims"]:
        assert set(item) == {"question_id", "claim", "quote", "kind", "planted"}
        assert item["kind"] in ("symbolic", "statistical")
        assert isinstance(item["planted"], bool)
        assert item["quote"] in EXCERPT
    assert [c["planted"] for c in payload["claims"]] == [False, False, False, True]
    assert payload["claims"][3]["quote"] == ""


def test_agents_never_see_the_planted_flag() -> None:
    lab = ClaimsLab()
    questions, hypotheses = library.questions()
    seen = json.dumps(lab.brief()) + json.dumps(
        [m.model_dump(mode="json") for m in [*questions, *hypotheses]]
    )
    for q in questions:
        seen += json.dumps([e.model_dump(mode="json") for e in library.diagnostics_for(q.id)])
    assert "planted" not in seen.lower()


def test_claims_source_is_a_documented_lab_event() -> None:
    assert E.CLAIMS_SOURCE == "claims.source"
    assert E.CLAIMS_SOURCE in E.LAB_EVENT_TYPES
    assert E.CLAIMS_SOURCE not in E.EVENT_TYPES
    doc = (ROOT / "docs" / "EVENTS.md").read_text(encoding="utf-8")
    assert "`claims.source`" in doc


def test_opening_events_must_be_lab_event_types(tmp_path: Path) -> None:
    class BadOpening(FakeLab):
        def opening_events(self) -> list[tuple[str, dict]]:
            return [("question.opened", {})]

    lab = BadOpening()
    cfg = load_config("default", runs_dir=str(tmp_path))
    with pytest.raises(ValueError, match="not a lab event type"):
        asyncio.run(run(lab, cfg, fake_deps(lab), run_id="bad-opening"))
    last = load_events(tmp_path / "bad-opening" / "events.jsonl")[-1]
    assert last["type"] == "run.error" and last["payload"]["where"] == "opening"


# --- diagnostics and the code referee ------------------------------------------------------


@pytest.mark.parametrize(("claim", "diagnostic"), DIAGNOSTICS, ids=IDS)
def test_diagnostic_code_runs_and_lands_in_its_expected_bin(claim, diagnostic) -> None:
    async def scenario() -> tuple[Observation, tuple[bool, str]]:
        lab = ClaimsLab()
        try:
            exp = library.experiment(claim, diagnostic)
            obs = await lab.run(exp)
            return obs, code_referee(exp, obs, lab._root())
        finally:
            await lab.close()

    obs, (ok, note) = asyncio.run(scenario())
    assert obs.valid, obs.referee_note
    assert obs.bin_id == EXPECTED_BIN[diagnostic.name]
    assert ok, note
    assert note.startswith("code referee:")
    # The UI's key number is the first numeric result field named in the observed bin's rule.
    for _, _, rule in diagnostic.bins:
        first = rule_names([rule])[0]
        assert type(obs.value[first]) in (int, float), (rule, first)


def _observed(tmp_path: Path, value: dict, *, logged: dict | None = None) -> Observation:
    log = tmp_path / "logs" / "x.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(f"$ python x.py\nRESULT: {json.dumps(logged or value)}\n", encoding="utf-8")
    return Observation(experiment_id="x", valid=True, value=value, log_ref="logs/x.log")


def test_code_referee_rejects_bad_runs(tmp_path: Path) -> None:
    claim, diagnostic = library.DIAGNOSTICS["wald_pergene"]
    exp = library.experiment(claim, diagnostic)
    good = _observed(tmp_path, {"fpr": 0.11, "seed": 1})
    good.bin_id = "anti_conservative"
    assert code_referee(exp, good, tmp_path)[0]

    tampered = _observed(tmp_path, {"fpr": 0.05}, logged={"fpr": 0.11})
    tampered.bin_id = "calibrated"
    ok, note = code_referee(exp, tampered, tmp_path)
    assert not ok and "differs" in note

    wrong_bin = _observed(tmp_path, {"fpr": 0.11})
    wrong_bin.bin_id = "calibrated"
    ok, note = code_referee(exp, wrong_bin, tmp_path)
    assert not ok and "anti_conservative" in note

    missing = _observed(tmp_path, {"rate": 0.11})
    missing.bin_id = "anti_conservative"
    ok, note = code_referee(exp, missing, tmp_path)
    assert not ok and "lacks fpr" in note

    text = _observed(tmp_path, {"fpr": "0.11"})
    text.bin_id = "anti_conservative"
    assert not code_referee(exp, text, tmp_path)[0]


def test_lab_rejects_unknown_diagnostics_and_crashes() -> None:
    claim, diagnostic = library.DIAGNOSTICS["bh_fdr_sim"]
    exp = library.experiment(claim, diagnostic)

    async def scenario() -> tuple[Observation, Observation]:
        lab = ClaimsLab()
        try:
            unknown = await lab.run(exp.model_copy(update={"design": {"diagnostic": "nope"}}))
            crash = await lab.run(exp.model_copy(update={"code": "raise SystemExit(3)"}))
            return unknown, crash
        finally:
            await lab.close()

    unknown, crash = asyncio.run(scenario())
    assert not unknown.valid and "not a claims-library diagnostic" in unknown.referee_note
    assert not crash.valid and crash.value is None and "status 3" in crash.referee_note


def test_critic_blocks_a_deliverable_without_a_section(tmp_path: Path) -> None:
    path = tmp_path / "CLAIMS.md"
    path.write_text("# Claims\n\n## 1. One (`claim-a`)\n\n**Verdict:** holds.\n\n### Limits\n")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    art = Artifact(name="CLAIMS.md", path=str(path), sha256=digest)
    critic = ClaimsAgents().critic
    assert asyncio.run(critic([art], {"CLAIMS.md": {"question_ids": ["claim-a"]}})) == []
    findings = asyncio.run(critic([art], {"CLAIMS.md": {"question_ids": ["claim-a", "claim-b"]}}))
    assert [(f.severity, f.rule) for f in findings] == [("block", "coverage")]
    assert asyncio.run(critic([], {}))[0].rule == "deliverable"


# --- the full run ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def claims_run(tmp_path_factory: pytest.TempPathFactory) -> Path:
    runs = tmp_path_factory.mktemp("claims-runs")
    argv = ["--lab", "claims", "--run-id", "claims-test", "--runs-dir", str(runs), "--fake-clock"]
    assert cli_main(argv) == 0
    return runs / "claims-test"


def _outcome(events: list[dict]) -> dict:
    settled, rejected, unresolved = {}, {}, {}
    keys = {}
    for e in events:
        p = e["payload"]
        if e["type"] == "hypothesis.proposed":
            keys[p["hypothesis"]["id"]] = p["hypothesis"]["answer_key"]
        elif e["type"] == "question.settled":
            settled[p["question_id"]] = keys[p["hypothesis_id"]]
        elif e["type"] == "hypothesis.rejected":
            rejected.setdefault(p["question_id"], []).append(keys[p["hypothesis_id"]])
        elif e["type"] == "question.unresolved":
            unresolved[p["question_id"]] = [keys[h] for h in p["top"]]
    return {"settled": settled, "rejected": rejected, "unresolved": unresolved}


def _check_claims_run(events: list[dict]) -> None:
    assert [e["type"] for e in events[:3]] == ["run.started", "claims.source", "profile.done"]
    assert events[0]["payload"]["lab"] == "claims"
    assert events[1]["payload"] == source_payload()
    assert events[-1]["type"] == "run.finished" and events[-1]["payload"]["status"] == "ok"
    outcome = _outcome(events)
    assert outcome["settled"] == SETTLED
    # The planted claim: the counterexample rejects 'holds'; 'fails' leads but does not
    # settle, because the FWER simulation cannot separate it from 'none of these' enough.
    assert outcome["rejected"]["claim-bh-fwer"] == ["holds"]
    assert outcome["unresolved"] == {"claim-bh-fwer": ["fails"]}
    rejection = next(
        e["payload"]
        for e in events
        if e["type"] == "hypothesis.rejected" and e["payload"]["question_id"] == "claim-bh-fwer"
    )
    assert "bh_fwer_counterexample" in rejection["reason"]
    verdicts = [e["payload"] for e in events if e["type"] == "referee.verdict"]
    assert verdicts and all(v["valid"] and v["note"].startswith("code referee:") for v in verdicts)
    budget = [e["payload"] for e in events if e["type"] == "budget.tick"][-1]
    assert budget["llm_calls"] == 0 and budget["cost_usd"] == 0


def test_full_run_settles_as_recorded(claims_run: Path) -> None:
    events = load_events(claims_run / "events.jsonl")
    _check_claims_run(events)
    assert replay_check(claims_run / "events.jsonl").ok


def test_claims_md_reports_verdicts_evidence_and_limits(claims_run: Path) -> None:
    text = (claims_run / "artifacts" / "CLAIMS.md").read_text(encoding="utf-8")
    assert "MVP on a hand-curated set of four claims" in text
    rows = [line for line in text.splitlines() if line.startswith("| ") and ". " in line[:6]]
    assert [row.split(" | ")[1] for row in rows] == [
        VERDICTS["holds"],
        VERDICTS["holds_if"],
        VERDICTS["holds"],
        "refuted",
    ]
    for c in library.CLAIMS:
        assert f"(`{c.id}`)" in text
    assert text.count("**Verdict:**") == 4 and text.count("### Limits") == 4
    assert "fpr_pergene = 0.1139" in text  # numbers come from the diagnostics' results
    assert "m = 3, m0 = 2" in text  # the counterexample is the evidence against 'holds'
    assert "Source: planted" in text


@pytest.mark.skipif(not DEMO.exists(), reason="no recorded claims demo")
def test_recorded_demo_replays_and_matches() -> None:
    events = load_events(DEMO)
    _check_claims_run(events)
    result = replay_check(DEMO)
    assert result.ok, result.summary()
