import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { guardRedirect } from "@/lib/auth-guard";

// A fast first check on the session cookie. The /app layout validates the session
// against the database, so a forged cookie gets no further than this redirect.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const to = guardRedirect(pathname, search, Boolean(getSessionCookie(request)));
  return to ? NextResponse.redirect(new URL(to, request.url)) : NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup"],
};
