"use client";

import { ActivityIcon, ChevronsUpDownIcon, DnaIcon, HomeIcon, LogOutIcon, UploadIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Wordmark } from "@/components/wordmark";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/app", label: "Home", icon: HomeIcon, match: (p: string) => p === "/app" || p.startsWith("/app/papers") },
  { href: "/app/explore", label: "Explore", icon: DnaIcon, match: (p: string) => p.startsWith("/app/explore") },
  { href: "/app/upload", label: "Upload a paper", icon: UploadIcon, match: (p: string) => p === "/app/upload" },
  { href: "/app/runs/demo", label: "Claims audit run", icon: ActivityIcon, match: (p: string) => p.startsWith("/app/runs") },
];

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? email).slice(0, 2);
  return letters.toUpperCase();
}

export function AppSidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center px-2 group-data-[collapsible=icon]:px-1.5">
          <Wordmark className="[&>span]:group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={item.match(pathname)}
                    tooltip={item.label}
                    render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Link
          href="/#results"
          className="mx-1 mb-1 block overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25 group-data-[collapsible=icon]:hidden"
        >
          <Image
            src="/plates/galton-quincunx.png"
            alt=""
            width={744}
            height={577}
            sizes="240px"
            className="h-20 w-full object-cover object-top"
          />
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Latest result, batch-04</p>
            <p className="mt-0.5 font-display text-lg leading-tight">
              0.811 <span className="text-muted-foreground">vs 0.608</span>
            </p>
            <p className="text-xs text-muted-foreground">Faults caught 12/12 vs 3/12</p>
          </div>
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" aria-label="Account menu">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
                      {initials(user.name, user.email)}
                    </span>
                    <span className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">{user.name || "Account"}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                    <ChevronsUpDownIcon className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
