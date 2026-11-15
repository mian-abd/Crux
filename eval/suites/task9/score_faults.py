"""Score fault detection on a graded Task 9 suite batch (evaluator side only).

    uv run python -m eval.suites.task9.score_faults --truth ../evaluator/task9-suite/evaluator/truth.json \
        --results ../evaluator/results/batch-02-suite/results.json --runs runs --out ../evaluator/results/batch-02-suite

The rubric is fixed in ``eval/results/task9_protocol_batch02.md``:

* **caught**: the run names the planted fault and its analysis handles it (relabels, excludes
  or repairs the affected samples or gene ids);
* **noticed**: the run names it but the analysis does not change;
* **missed**: the run does not name it.

Two signals per run. A judge model reads the run's METHODS.md next to the truth for that case
and returns the verdict with the exact sentence it relied on (the judge sees the truth, the
agents never did). For swarm runs, the event log also says whether the matching library
question settled on the fault option, which is reported alongside as a check on the judge.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

FAULT_TEXT = {
    "sample_swap": "the count columns of two samples (one control, one treated, same cell line) were swapped",
    "label_inversion": "the condition labels of a control group and a treated group in one cell line were inverted",
    "duplicate_library": "one library's counts were copied over its replicate (a duplicated library under two names)",
    "low_depth": "one library was thinned to about 2% of its reads (a degraded, low-depth library)",
    "cell_line_swap": "the cell_line labels of a T98G control and a HEK293 control sample were swapped",
    "gene_version": "Ensembl version suffixes were stripped or added on a subset of gene ids (mixed id versions)",
}
LIBRARY_FORK = {
    "sample_swap": "sample_labels",
    "label_inversion": "group_direction",
    "duplicate_library": "duplicates",
    "low_depth": "sample_quality",
    "cell_line_swap": "cell_line",
    "gene_version": "gene_ids",
}
JUDGE = """You are a strict, impartial evaluator. A data-analysis agent analysed a dataset into which
one fault was deliberately planted. You know the fault; the agent did not. From the agent's
METHODS.md only, classify:
- "caught": it names this specific problem (or an equivalent description of it, possibly
  naming the affected samples or ids) AND its analysis handled it (relabelled, swapped back,
  excluded, or repaired the affected samples or ids).
- "noticed": it names the problem but did not change the analysis because of it.
- "missed": it does not identify this problem. Generic checks that found nothing, or a
  different problem, count as missed.
Quote the single sentence that most supports your verdict ("" if missed)."""


class Verdict(BaseModel):
    verdict: Literal["caught", "noticed", "missed"]
    quote: str
    reason: str


def swarm_settled_on_fault(events_path: Path, fault: str) -> str | None:
    """'fault' / 'clean' / 'open' for the matching library question, or None if absent."""
    if not events_path.is_file():
        return None
    qid = f"library-{LIBRARY_FORK[fault]}"
    outcome = "open"
    for line in events_path.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        payload = event["payload"]
        if event["type"] == "question.settled" and payload.get("question_id") == qid:
            outcome = "fault" if payload["hypothesis_id"].endswith("-h1") else "clean"
    return outcome


async def judge(llm, fault: str, affected: list[str], methods: str) -> Verdict:
    messages = [
        {"role": "system", "content": JUDGE},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "planted_fault": FAULT_TEXT[fault],
                    "affected_samples": affected,
                    "methods_md": methods[:20000],
                }
            ),
        },
    ]
    [verdict] = await llm.structured("critic", Verdict, messages)
    return Verdict.model_validate(verdict)


async def score(truth: dict, results: dict, runs: Path) -> list[dict]:
    from agents.llm import LLM, STRONG_MODEL, LLMConfig

    config = LLMConfig()
    config.role_models["critic"] = STRONG_MODEL
    llm = LLM(config)
    rows, jobs = [], []
    for run in results["runs"]:
        info = truth["cases"].get(run.get("case", ""))
        if info is None or info["fault"] == "clean":
            continue
        folder = runs / run["run_id"]
        methods_path = folder / "artifacts" / "METHODS.md"
        methods = (
            methods_path.read_text(encoding="utf-8") if methods_path.is_file() else ""
        )
        row = {
            "case": run["case"],
            "arm": run["arm"],
            "run_id": run["run_id"],
            "fault": info["fault"],
            "split": info["split"],
            "score": run.get("mean"),
            "swarm_question": swarm_settled_on_fault(
                folder / "events.jsonl", info["fault"]
            )
            if run["arm"] == "swarm"
            else None,
        }
        rows.append(row)
        jobs.append(
            judge(llm, info["fault"], info["affected_samples"], methods)
            if methods
            else asyncio.sleep(
                0, result=Verdict(verdict="missed", quote="", reason="no METHODS.md")
            )
        )
    for row, verdict in zip(rows, await asyncio.gather(*jobs), strict=True):
        row.update(verdict=verdict.verdict, quote=verdict.quote, reason=verdict.reason)
    return rows


def report(rows: list[dict], out: Path) -> None:
    arms = sorted({r["arm"] for r in rows})
    lines = [
        "# Fault detection, Task 9 suite (judge verdicts; rubric in task9_protocol_batch02.md)",
        "",
        "| Case | Fault | "
        + " | ".join(f"{a} verdict | {a} score" for a in arms)
        + " | swarm question |",
        "| --- | --- | " + " | ".join("--- | ---" for _ in arms) + " | --- |",
    ]
    for case in sorted({r["case"] for r in rows}):
        by_arm = {r["arm"]: r for r in rows if r["case"] == case}
        fault = next(iter(by_arm.values()))["fault"]
        cells = []
        for a in arms:
            r = by_arm.get(a)
            cells += [
                r["verdict"] if r else "-",
                f"{r['score']:.3f}" if r and r["score"] is not None else "-",
            ]
        swarm_q = by_arm.get("swarm", {}).get("swarm_question") or "-"
        lines.append(f"| {case} | {fault} | " + " | ".join(cells) + f" | {swarm_q} |")
    lines += ["", "| Arm | Caught | Noticed | Missed |", "| --- | --- | --- | --- |"]
    for a in arms:
        verdicts = [r["verdict"] for r in rows if r["arm"] == a]
        lines.append(
            f"| {a} | {verdicts.count('caught')} | {verdicts.count('noticed')} | {verdicts.count('missed')} |"
        )
    (out / "fault_detection.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "fault_detection.json").write_text(
        json.dumps(rows, indent=2), encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--truth", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--runs", type=Path, default=Path("runs"))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    truth = json.loads(args.truth.read_text(encoding="utf-8"))
    results = json.loads(args.results.read_text(encoding="utf-8"))
    rows = asyncio.run(score(truth, results, args.runs))
    report(rows, args.out)
    print((args.out / "fault_detection.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
