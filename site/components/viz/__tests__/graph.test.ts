// Unit tests for the event-to-graph reducer and the sequence helpers.
// Runner: vitest, with the folder's own config. From site/:
//   npx vitest run --config components/viz/vitest.config.mts

import assert from "node:assert/strict";
import { test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildGraph,
  parseEventLog,
  verdictOf,
  type OptionNode,
  type QuestionNode,
  type DiagnosticNode,
  type RunEvent,
} from "../graph";
import { describeHighlight, layoutHelix, HBB_FIRST_27, SICKLE_HIGHLIGHT } from "../sequence";
import { claimsRun } from "./fixtures";

const byId = <T>(g: ReturnType<typeof buildGraph>, id: string) =>
  g.nodes.find((n) => n.id === id) as T | undefined;

test("answer keys map to verdicts", () => {
  assert.equal(verdictOf("holds"), "holds");
  assert.equal(verdictOf("fails"), "refuted");
  assert.equal(verdictOf("alt_param"), "refuted");
  assert.equal(verdictOf("fails_conservative"), "refuted");
  assert.equal(verdictOf("holds_if"), "conditional");
  assert.equal(verdictOf(" Holds "), "holds");
  assert.equal(verdictOf("design ~ condition"), null);
  assert.equal(verdictOf("constructor"), null);
  assert.equal(verdictOf(null), null);
});

test("claims run: nodes, edges, claim labels and verdicts", () => {
  const g = buildGraph(claimsRun());
  assert.equal(g.lab, "claims");
  assert.equal(g.source?.license, "CC0-1.0");
  assert.equal(g.counts.questions, 3);
  assert.equal(g.counts.options, 11);
  assert.equal(g.counts.diagnostics, 2);

  const q1 = byId<QuestionNode>(g, "claim-1");
  assert.ok(q1);
  assert.equal(q1.label, "HbS comes from a single substitution in codon 6 of HBB");
  assert.equal(q1.status, "settled");
  assert.equal(q1.winner, "claim-1-h1");

  const q3 = byId<QuestionNode>(g, "claim-3");
  assert.equal(q3?.claim?.planted, true);
  assert.equal(q3?.winner, "claim-3-h2");

  const winner = byId<OptionNode>(g, "claim-3-h2");
  assert.equal(winner?.status, "winner");
  assert.equal(winner?.verdict, "refuted");
  assert.equal(byId<OptionNode>(g, "claim-1-h2")?.verdict, "conditional");
  assert.equal(byId<OptionNode>(g, "claim-3-h3")?.verdict, "refuted");
  assert.equal(byId<OptionNode>(g, "claim-1.h0")?.isNull, true);

  const rejected = byId<OptionNode>(g, "claim-1-h3");
  assert.equal(rejected?.status, "rejected");
  assert.match(rejected?.rejectedReason ?? "", /fell below/);

  // One edge per option, one per (diagnostic, question) pair.
  assert.equal(g.links.filter((l) => l.kind === "option").length, 11);
  const diag = g.links.filter((l) => l.kind === "diagnostic");
  assert.deepEqual(diag.map((l) => l.id).sort(), [
    "ref-beta6->claim-3",
    "ref-codon6->claim-1",
    "ref-codon6->claim-2",
  ]);
  assert.ok(g.links.find((l) => l.id === "claim-1-h1->claim-1")?.winner);
  assert.ok(g.links.find((l) => l.id === "claim-1-h3->claim-1")?.rejected);
});

test("posteriors follow belief updates; diagnostics record their runs", () => {
  const events = claimsRun();
  const cut = events.findIndex((e) => e.type === "belief.updated");
  const before = buildGraph(events.slice(0, cut));
  assert.equal(byId<OptionNode>(before, "claim-1-h1")?.posterior, 0.45);
  const d = byId<DiagnosticNode>(before, "ref-codon6");
  assert.equal(d?.status, "done");
  assert.equal(d?.observed, "single_gag_gtg");
  assert.equal(typeof d?.runSeq, "number");
  assert.equal(d?.eigBits, 0.82);
  const after = buildGraph(events.slice(0, cut + 1));
  assert.equal(byId<OptionNode>(after, "claim-1-h1")?.posterior, 0.93);
  assert.match(after.ticker?.text ?? "", /Belief updated/);
});

test("pure: same input, same output; input untouched; order by seq", () => {
  const events = claimsRun();
  const copy = JSON.parse(JSON.stringify(events)) as RunEvent[];
  const a = buildGraph(events);
  const b = buildGraph([...events].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(events, copy);
});

test("ignores unknown types and malformed payloads", () => {
  const g = buildGraph([
    { seq: 0, type: "nonsense", ts: 0, payload: { x: 1 } },
    { seq: 1, type: "question.opened", ts: 0, payload: null },
    { seq: 2, type: "hypothesis.proposed", ts: 0, payload: { hypothesis: "oops" } },
    { seq: 3, type: "belief.updated", ts: 0, payload: { posterior: [1, 2] } },
    { seq: 4, type: "question.opened", ts: 0, payload: { question: { id: "q", text: "Q?" } } },
  ]);
  assert.equal(g.nodes.length, 1);
  assert.equal(g.lastSeq, 4);
});

test("reopened question clears its verdict", () => {
  const base = claimsRun();
  const last = base[base.length - 1]!.seq;
  const g = buildGraph([
    ...base,
    {
      seq: last + 1,
      type: "question.opened",
      ts: 0,
      payload: { reopened: true, question: { id: "claim-1", text: "again" } },
    },
  ]);
  const q = byId<QuestionNode>(g, "claim-1");
  assert.equal(q?.status, "open");
  assert.equal(q?.winner, null);
  assert.equal(byId<OptionNode>(g, "claim-1-h1")?.status, "active");
});

function findUp(rel: string): string | null {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

for (const name of ["task9_real_swarm_run1.jsonl", "task9_tools_run2.jsonl", "claims_deseq2.jsonl"]) {
  const path = findUp(join("runs", "demo", name));
  test.skipIf(!path)(`real log ${name}`, () => {
    const events = parseEventLog(readFileSync(path!, "utf8"));
    const g = buildGraph(events);
    const count = (t: string) => events.filter((e) => e.type === t).length;
    const ids = new Set(events.filter((e) => e.type === "question.opened").map((e) => e.payload.question.id));
    assert.equal(g.counts.questions, ids.size);
    assert.equal(
      g.counts.settled,
      new Set(events.filter((e) => e.type === "question.settled").map((e) => e.payload.question_id)).size,
    );
    assert.equal(g.counts.diagnostics, count("experiment.proposed"));
    assert.ok(g.counts.rejected >= count("hypothesis.rejected"));
    // Every edge joins two existing nodes.
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    for (const l of g.links) assert.ok(nodeIds.has(l.source) && nodeIds.has(l.target), l.id);
    // Each settled question has exactly one winner option.
    for (const q of g.nodes.filter(
      (n): n is QuestionNode => n.kind === "question" && n.status === "settled",
    )) {
      const winners = g.nodes.filter(
        (n) => n.kind === "option" && n.questionId === q.id && n.status === "winner",
      );
      assert.equal(winners.length, 1, q.id);
    }
  });
}

test("sickle highlight label", () => {
  const info = describeHighlight(HBB_FIRST_27, SICKLE_HIGHLIGHT);
  assert.equal(info.label, "codon 6: GAG → GTG");
  assert.equal(info.detail, "Glu → Val · c.20A>T");
  assert.deepEqual(info.indices, [19]);
  const codon = describeHighlight(HBB_FIRST_27, { index: 18, from: "GAG", to: "GTG" });
  assert.equal(codon.label, "codon 6: GAG → GTG");
  assert.deepEqual(codon.indices, [19]);
});

test("helix layout is centred with B-DNA geometry", () => {
  const l = layoutHelix(HBB_FIRST_27);
  assert.equal(l.pairs.length, 27);
  assert.ok(Math.abs(l.pairs[0]!.p0[0] + l.pairs[26]!.p0[0]) < 1e-9);
  assert.equal(l.pairs[0]!.partner, "T");
  const r = Math.hypot(l.pairs[5]!.p1[1], l.pairs[5]!.p1[2]);
  assert.ok(Math.abs(r - 1) < 1e-9);
});

test.skipIf(!findUp(join("runs", "demo", "claims_deseq2.jsonl")))(
  "recorded claims run: claim labels, verdicts, planted claim",
  () => {
    const path = findUp(join("runs", "demo", "claims_deseq2.jsonl"))!;
    const g = buildGraph(parseEventLog(readFileSync(path, "utf8")));
    assert.equal(g.lab, "claims");
    assert.equal(g.source?.license, "CC BY 4.0");
    const questions = g.nodes.filter((n): n is QuestionNode => n.kind === "question");
    assert.equal(questions.length, 4);
    for (const q of questions) assert.ok(q.claim && q.label === q.claim.claim, q.id);
    const fwer = byId<QuestionNode>(g, "claim-bh-fwer");
    assert.equal(fwer?.claim?.planted, true);
    assert.equal(fwer?.status, "unresolved");
    assert.equal(byId<OptionNode>(g, "claim-bh-fwer.holds")?.status, "rejected");
    assert.equal(byId<QuestionNode>(g, "claim-wald-calibration")?.winner, "claim-wald-calibration.holds_if");
    assert.equal(byId<OptionNode>(g, "claim-wald-calibration.holds_if")?.verdict, "conditional");
    assert.equal(byId<OptionNode>(g, "claim-nb-variance.alt_param")?.verdict, "refuted");
  },
);
