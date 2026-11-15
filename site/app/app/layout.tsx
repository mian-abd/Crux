import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppSidebar } from "@/components/app/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Workspace" };

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  // The real guard: the session is checked against the database on every request.
  const user = await requireUser();
  return (
    <SidebarProvider>
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-md px-3 py-2 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Public site
            </Link>
            <Link href="/app/upload" className="pill h-10 pr-3.5 text-[0.9rem]">
              Upload a paper
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main id="main" className="flex-1 px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-[78rem]">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
