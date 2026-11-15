import Link from "next/link";

import { cn } from "@/lib/utils";

/** Four points in the shape of the constellation the project is named after. */
export function CruxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("size-5", className)}>
      <path d="M10 2.5 10.6 17.5M3.5 8.2 16.8 9.6" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      <circle cx="10" cy="2.5" r="1.5" fill="currentColor" />
      <circle cx="10.6" cy="17.5" r="1.9" fill="currentColor" />
      <circle cx="3.5" cy="8.2" r="1.4" fill="currentColor" />
      <circle cx="16.8" cy="9.6" r="1.7" fill="var(--brand)" />
    </svg>
  );
}

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Crux home"
      className={cn("inline-flex items-center gap-2 rounded-sm text-foreground", className)}
    >
      <CruxMark className="size-[1.35rem]" />
      <span className="font-display text-[1.6rem] leading-none font-normal tracking-[-0.02em]">Crux</span>
    </Link>
  );
}
