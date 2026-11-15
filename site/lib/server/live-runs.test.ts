import { describe, expect, it } from "vitest";

import { LIMITS, isRunId, limitReason } from "@/lib/server/live-runs";

describe("live run limits", () => {
  it("allows a run when every counter is under its limit", () => {
    expect(limitReason({ userToday: 0, allToday: 0, allActive: 0 })).toBeNull();
  });

  it("stops a user at the daily limit per account", () => {
    expect(limitReason({ userToday: LIMITS.perUserPerDay, allToday: 0, allActive: 0 })).toMatch(/daily limit/);
  });

  it("stops everyone at the site-wide daily limit", () => {
    expect(limitReason({ userToday: 0, allToday: LIMITS.perDay, allActive: 0 })).toMatch(/whole site/);
  });

  it("stops a new run while the concurrent limit is reached", () => {
    expect(limitReason({ userToday: 0, allToday: 1, allActive: LIMITS.concurrent })).toMatch(/already going/);
  });
});

describe("run ids", () => {
  it("accepts the engine's ids and rejects path tricks", () => {
    expect(isRunId("r-20261115-173621-a935")).toBe(true);
    expect(isRunId("..")).toBe(false);
    expect(isRunId("a/b")).toBe(false);
    expect(isRunId("")).toBe(false);
  });
});
