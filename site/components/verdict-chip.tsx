import { CheckIcon, CircleDashedIcon, CircleHelpIcon, CircleSlashIcon, SplitIcon, XIcon } from "lucide-react";

import { VERDICT_LABEL, type ClaimVerdict } from "@/lib/crux/claims";
import { cn } from "@/lib/utils";

// Colour is never the only signal: every chip carries an icon and its text.
export const VERDICT_STYLE: Record<ClaimVerdict, { text: string; chip: string; mark: string }> = {
  holds: {
    text: "text-v-holds",
    chip: "border-v-holds/40 bg-v-holds/10 text-v-holds",
    mark: "bg-v-holds/15 decoration-v-holds",
  },
  refuted: {
    text: "text-v-refuted",
    chip: "border-v-refuted/40 bg-v-refuted/10 text-v-refuted",
    mark: "bg-v-refuted/15 decoration-v-refuted",
  },
  holds_if: {
    text: "text-v-cond",
    chip: "border-v-cond/40 bg-v-cond/10 text-v-cond",
    mark: "bg-v-cond/15 decoration-v-cond",
  },
  unresolved: {
    text: "text-v-unresolved",
    chip: "border-v-unresolved/50 bg-v-unresolved/10 text-v-unresolved",
    mark: "bg-v-unresolved/15 decoration-v-unresolved",
  },
  other: {
    text: "text-v-open",
    chip: "border-foreground/30 bg-muted text-foreground",
    mark: "bg-muted decoration-foreground/60",
  },
  open: {
    text: "text-v-open",
    chip: "border-border bg-muted text-muted-foreground",
    mark: "bg-muted decoration-v-open",
  },
};

/** The viewer's labels, with the conditional verdict spelled out. */
export const VERDICT_TEXT: Record<ClaimVerdict, string> = {
  ...VERDICT_LABEL,
  holds_if: "Holds under a condition",
};

const ICON = {
  holds: CheckIcon,
  refuted: XIcon,
  holds_if: SplitIcon,
  unresolved: CircleHelpIcon,
  other: CircleSlashIcon,
  open: CircleDashedIcon,
} as const;

export function VerdictChip({ verdict, className }: { verdict: ClaimVerdict; className?: string }) {
  const Icon = ICON[verdict];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        VERDICT_STYLE[verdict].chip,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {VERDICT_TEXT[verdict]}
    </span>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
