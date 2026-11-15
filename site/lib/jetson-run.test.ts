// The One Letter section on /runs: the recording ships with the site, the replay points at the
// fixture the viewer bundles, and the timeline matches the recorded event log.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JetsonRun } from "@/components/jetson-run";
import { VIEWER_URL, viewerFixture } from "@/lib/site";

const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

describe("JetsonRun", () => {
  const html = renderToStaticMarkup(createElement(JetsonRun));

  it("plays the recording that ships with the site", () => {
    expect(html).toContain('src="/media/one-letter-jetson.mp4"');
    expect(existsSync(fileURLToPath(new URL("../public/media/one-letter-jetson.mp4", import.meta.url)))).toBe(true);
  });

  it("replays the bundled event log in the viewer, in real time", () => {
    const replay = viewerFixture("demo_oneletter_live", 1);
    expect(replay).toBe(`${VIEWER_URL}/?replay=demo_oneletter_live&speed=1`);
    expect(html).toContain(replay.replaceAll("&", "&amp;"));
    const index = JSON.parse(readFileSync(repo("web/public/fixtures/index.json"), "utf-8")) as { name: string }[];
    expect(index.map((f) => f.name)).toContain("demo_oneletter_live");
  });

  it("states only what the event log records", () => {
    const events = readFileSync(repo("web/public/fixtures/demo_oneletter_live.jsonl"), "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { ts: number; type: string; payload: Record<string, unknown> });
    const t0 = events[0].ts;
    const at = (e: { ts: number }) => `${(e.ts - t0).toFixed(1)} s`;
    const reads = events.filter((e) => e.type === "dna.read");
    const verdicts = events.filter((e) => e.type === "dna.verdict");
    expect(reads.map((e) => e.payload.bases)).toEqual(["GTGGAGAAG", "GTGGAGAAG", "AAGGAGAAG", "AAGGAGAAG"]);
    for (const e of [...reads, ...verdicts]) expect(html).toContain(at(e));
    expect(verdicts.map((e) => e.payload.name)).toEqual(["HbS (sickle)", "HbC"]);
    expect(verdicts.every((e) => e.payload.author === "jetson/qwen2.5:3b")).toBe(true);
    expect(verdicts.map((e) => (e.payload.posterior as number).toFixed(2))).toEqual(["0.97", "0.97"]);
    expect(events.some((e) => e.type === "surprise.raised")).toBe(true);
    expect(events.some((e) => e.type === "dna.lesson")).toBe(true);
  });
});
