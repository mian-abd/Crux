import type { Metadata } from "next";

import { AppSidebar } from "@/components/app/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="flex-1 px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
