// Self-hosted email and password accounts. Passwords are hashed by the library and
// sessions are httpOnly cookies; nothing leaves this machine.

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loginPath } from "@/lib/auth-guard";
import { authSecret, getDb } from "./db";

const options = {
  database: getDb(),
  secret: authSecret(),
  baseURL: process.env.BETTER_AUTH_URL || undefined,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

const globalForAuth = globalThis as unknown as { __cruxAuthSchema?: Promise<void> };

/** Create the account tables on first use, so `npm run dev` needs no migration step. */
export function ensureAuthSchema(): Promise<void> {
  globalForAuth.__cruxAuthSchema ??= getMigrations(options).then((m) => m.runMigrations());
  return globalForAuth.__cruxAuthSchema;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function currentUser(): Promise<SessionUser | null> {
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/** For pages and actions under /app: the signed-in user, or a redirect to /login. */
export async function requireUser(from = "/app"): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(loginPath(from));
  return user;
}
