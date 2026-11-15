// The routing rules for signed-in and signed-out visitors, as pure functions so they
// can be tested without a server. proxy.ts applies them to the session cookie; the
// /app layout then checks the session itself against the database.

export const APP_HOME = "/app";
const AUTH_PAGES = new Set(["/login", "/signup"]);

export function isProtectedPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

/**
 * Where to go after signing in. Only same-site paths under /app are accepted, so a
 * crafted `next` cannot send someone to another site.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return APP_HOME;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return APP_HOME;
  let pathname: string;
  try {
    pathname = new URL(next, "http://site.invalid").pathname;
  } catch {
    return APP_HOME;
  }
  return isProtectedPath(pathname) ? next : APP_HOME;
}

export function loginPath(from: string): string {
  const next = safeNext(from);
  return next === APP_HOME ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

/** The redirect for this request, or null to let it through. */
export function guardRedirect(
  pathname: string,
  search: string,
  hasSessionCookie: boolean,
): string | null {
  if (isProtectedPath(pathname) && !hasSessionCookie) return loginPath(pathname + search);
  if (AUTH_PAGES.has(pathname) && hasSessionCookie) return APP_HOME;
  return null;
}
