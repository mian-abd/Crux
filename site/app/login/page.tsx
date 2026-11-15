import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { safeNext } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <LoginForm next={safeNext(typeof next === "string" ? next : null)} />
    </AuthShell>
  );
}
