"""Agent roles for the claims lab (``core.interfaces.AgentRoles``), all deterministic.

* ``propose``: the curated questions and options (``labs.claims.library.questions``).
* ``design``: the question's pre-registered diagnostics; the orchestrator drops spent ones.
* ``referee``: a blind code referee (``code_referee``). It sees the experiment's code, bins
  and result and the run log, never the options or their predictions. The LLM referee
  (``agents.referee``) is not used: its prompt asks whether the result is "derived from the
  data", which does not fit self-contained simulations and symbolic derivations, and a code
  referee keeps the demo reproducible with no API key. Its first checks are the LLM
  referee's own code checks (``agents.referee.code_check``).
* ``critic``: checks that ``CLAIMS.md`` exists, matches its hash and has a verdict and
  limits for every claim.
* ``report``: the methods text from the run's facts (``labs.claims.report``).
* ``regenerate``: no new options; after a surprise the mass stays on "none of these".

The predictor is not a role: ``build_claims_run`` uses ``SampledPredictor`` with library rows.
"""

from __future__ import annotations

import ast
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from agents.referee import code_check, read_log
from core.schemas import (
    Artifact,
    CriticFinding,
    EngineState,
    Evidence,
    Experiment,
    Hypothesis,
    Observation,
    Question,
    Report,
    Trial,
    eval_rule,
)
from labs.claims.library import diagnostics_for, questions
from labs.claims.report import methods_markdown

_RULE_FUNCS = {"abs", "len", "min", "max", "round", "float", "int", "lower"}
_RULE_CONSTS = {"True", "False", "None", "value"}


def rule_names(rules: list[str]) -> list[str]:
    """The result keys that bin rules read, in first-seen order."""
    names: dict[str, None] = {}
    for rule in rules:
        found = [
            node
            for node in ast.walk(ast.parse(rule, mode="eval"))
            if isinstance(node, ast.Name) and node.id not in _RULE_FUNCS | _RULE_CONSTS
        ]
        for node in sorted(found, key=lambda n: (n.lineno, n.col_offset)):
            names.setdefault(node.id, None)
    return list(names)


def _fmt(value: Any) -> str:
    return f"{value:.4g}" if isinstance(value, float) else json.dumps(value)


def code_referee(
    experiment: Experiment, observation: Observation, run_dir: Path | str | None
) -> tuple[bool, str]:
    """``(valid, note)``: did the run produce one well-formed result that the bins classify?

    Checks, in order: the LLM referee's code checks (invalid run, empty or non-dict result,
    unknown bin, an error in the log); exactly one ``RESULT:`` line in the log, equal to the
    recorded result; every key the bin rules read is present and a finite number or a
    boolean; and exactly one bin rule holds, the observed one.
    """
    lines = read_log(observation.log_ref, run_dir)
    rejected = code_check(experiment, observation, lines)
    if rejected is not None:
        return False, rejected
    results = [ln for ln in lines if ln.startswith("RESULT:")]
    if len(results) != 1:
        return False, f"the log has {len(results)} RESULT lines; expected one"
    try:
        logged = json.loads(results[0].removeprefix("RESULT:"))
    except ValueError:
        return False, "the log's RESULT line is not JSON"
    value = observation.value
    assert isinstance(value, dict)  # code_check rejected anything else
    if logged != value:
        return False, "the recorded result differs from the log's RESULT line"
    names = rule_names([b.rule for b in experiment.bins])
    missing = [n for n in names if n not in value]
    if missing:
        return False, f"the result lacks {', '.join(missing)}, which the bin rules read"
    bad = [
        n
        for n in names
        if not isinstance(value[n], (bool, int, float))
        or (isinstance(value[n], float) and not math.isfinite(value[n]))
    ]
    if bad:
        return False, f"{', '.join(bad)} is not a finite number or a boolean"
    matched = [b.id for b in experiment.bins if eval_rule(b.rule, value)]
    if matched != [observation.bin_id]:
        return False, f"the bin rules that hold are {matched}, not just {observation.bin_id!r}"
    facts = ", ".join(f"{n} = {_fmt(value[n])}" for n in names)
    return True, f"code referee: one RESULT line; only bin '{observation.bin_id}' holds ({facts})"


class ClaimsAgents:
    def __init__(self, lab: Any = None) -> None:
        self.lab = lab

    async def propose(
        self, brief: dict, evidence: list[Evidence]
    ) -> tuple[list[Question], list[Hypothesis]]:
        return questions()

    async def design(
        self,
        question: Question,
        hypotheses: list[Hypothesis],
        evidence: list[Evidence],
        history: list[Trial],
    ) -> list[Experiment]:
        return diagnostics_for(question.id)

    async def referee(self, experiment: Experiment, observation: Observation) -> tuple[bool, str]:
        run_dir = getattr(self.lab, "run_dir", None)
        return code_referee(experiment, observation, run_dir)

    async def critic(self, artifacts: list[Artifact], contract: dict) -> list[CriticFinding]:
        spec = contract.get("CLAIMS.md", {}) or {}
        art = next((a for a in artifacts if a.name == "CLAIMS.md"), None)

        def finding(fid: str, severity: str, rule: str, message: str) -> CriticFinding:
            return CriticFinding(
                id=fid, artifact="CLAIMS.md", severity=severity, rule=rule, message=message
            )

        if art is None:
            return [finding("claims-missing", "block", "deliverable", "CLAIMS.md was not written")]
        path = Path(art.path)
        if not path.is_file():
            return [finding("claims-missing", "block", "deliverable", f"{art.path} does not exist")]
        if hashlib.sha256(path.read_bytes()).hexdigest() != art.sha256:
            return [
                finding("claims-hash", "block", "integrity", "CLAIMS.md changed after delivery")
            ]
        sections = path.read_text(encoding="utf-8").split("\n## ")
        findings = []
        for qid in spec.get("question_ids", []):
            section = next((s for s in sections if f"(`{qid}`)" in s.splitlines()[0]), None)
            if section is None:
                findings.append(
                    finding(f"no-section-{qid}", "block", "coverage", f"no section for {qid}")
                )
            elif "**Verdict:**" not in section:
                findings.append(
                    finding(f"no-verdict-{qid}", "block", "verdict", f"{qid} has no verdict")
                )
            elif "### Limits" not in section:
                findings.append(
                    finding(f"no-limits-{qid}", "warn", "limits", f"{qid} states no limits")
                )
        return findings

    async def report(self, state: EngineState, artifacts: list[Artifact]) -> Report:
        # The orchestrator overwrites run id, artifacts, rejections, unresolved, cost, time.
        return Report(
            run_id=state.run_id,
            artifacts=artifacts,
            methods_md=methods_markdown(state),
            rejected=[],
            unresolved=[],
            cost_usd=0.0,
            seconds=0.0,
        )

    async def regenerate(
        self, question: Question, hypotheses: list[Hypothesis], history: list[Trial]
    ) -> list[Hypothesis]:
        return []
