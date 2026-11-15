import { describe, expect, it } from "vitest";

import { guardRedirect, isProtectedPath, loginPath, safeNext } from "./auth-guard";

describe("auth guard", () => {
  it("protects /app and everything under it, and nothing else", () => {
    expect(isProtectedPath("/app")).toBe(true);
    expect(isProtectedPath("/app/runs/demo")).toBe(true);
    expect(isProtectedPath("/application")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/explore")).toBe(false);
  });

  it("sends a signed-out visitor to /login and remembers where they were going", () => {
    expect(guardRedirect("/app", "", false)).toBe("/login");
    expect(guardRedirect("/app/papers/abc", "", false)).toBe("/login?next=%2Fapp%2Fpapers%2Fabc");
    expect(guardRedirect("/app/runs/demo", "?speed=2", false)).toBe(
      "/login?next=%2Fapp%2Fruns%2Fdemo%3Fspeed%3D2",
    );
  });

  it("lets a signed-in visitor through, and keeps them off the sign-in pages", () => {
    expect(guardRedirect("/app/upload", "", true)).toBeNull();
    expect(guardRedirect("/login", "", true)).toBe("/app");
    expect(guardRedirect("/signup", "", true)).toBe("/app");
  });

  it("leaves public pages alone either way", () => {
    for (const signedIn of [true, false]) {
      expect(guardRedirect("/", "", signedIn)).toBeNull();
      expect(guardRedirect("/explore", "", signedIn)).toBeNull();
    }
    expect(guardRedirect("/login", "", false)).toBeNull();
  });

  it("only accepts a next path inside /app", () => {
    expect(safeNext("/app/papers/1")).toBe("/app/papers/1");
    expect(safeNext(null)).toBe("/app");
    expect(safeNext("https://elsewhere.example/app")).toBe("/app");
    expect(safeNext("//elsewhere.example/app")).toBe("/app");
    expect(safeNext("/\\elsewhere.example")).toBe("/app");
    expect(safeNext("/login")).toBe("/app");
    expect(safeNext("/app/../login")).toBe("/app");
    expect(loginPath("/explore")).toBe("/login");
  });
});
