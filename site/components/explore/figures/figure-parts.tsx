// Small shared pieces for the Explore figures: the figure frame, a source link
// in the page's repoFile() style, mono readouts and a legend swatch.

import { repoFile } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SourceLink({ path, children }: { path: string; children?: React.ReactNode }) {
  return (
    <a
      href={repoFile(path)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs wrap-break-word underline underline-offset-4 hover:text-foreground"
    >
      {children ?? path}
    </a>
  );
}

/** A figure on a card, with an eyebrow, a title and a caption. */
export function FigureCard({
  eyebrow,
  title,
  caption,
  className,
  children,
  ...rest
}: Omit<React.ComponentProps<"figure">, "title"> & {
  eyebrow: string;
  title: React.ReactNode;
  caption: React.ReactNode;
}) {
  return (
    <figure className={cn("flex min-w-0 flex-col rounded-lg border bg-card p-4 sm:p-6", className)} {...rest}>
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="mt-3 font-display text-2xl leading-tight text-balance sm:text-3xl">{title}</h3>
      <div className="mt-6 min-w-0 flex-1">{children}</div>
      <figcaption className="mt-6 border-t pt-4 text-sm leading-relaxed text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

/**
 * Inline maths. The site's fonts load only their Latin subset, so Greek letters
 * would fall back to a mismatched system sans; a system serif carries Greek and
 * keeps a formula in one face.
 */
export function Maths({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-serif whitespace-nowrap", className)}>{children}</span>;
}

/** A labelled number in mono: the page's way of showing a computed value. */
export function Readout({
  label,
  value,
  note,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular-nums">
        {value}
        {note ? <span className="block text-[11px] text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  );
}

/** A short line or dot sample for a legend, drawn in a chart colour. */
export function Swatch({
  color,
  kind = "line",
  dashed = false,
}: {
  color: string;
  kind?: "line" | "dot" | "ring" | "area";
  dashed?: boolean;
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 10" className="h-2.5 w-[18px] shrink-0 overflow-visible">
      {kind === "line" && (
        <line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth="1.5" strokeDasharray={dashed ? "3 2.5" : undefined} />
      )}
      {kind === "dot" && <circle cx="9" cy="5" r="3.5" fill={color} />}
      {kind === "ring" && <circle cx="9" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1.25" />}
      {kind === "area" && <rect x="1" y="0.5" width="16" height="9" rx="1.5" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="0.75" />}
    </svg>
  );
}

export function Legend({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground", className)}>{children}</ul>;
}

export function LegendItem({ children }: { children: React.ReactNode }) {
  return <li className="inline-flex items-center gap-2">{children}</li>;
}

/**
 * An SVG tick label for a power of ten: small numbers as decimals, the rest as
 * 10 with a raised exponent (a tspan, since mono fonts often lack superscript digits).
 */
export function Pow10Label({ exp, x, y, anchor = "end" }: { exp: number; x: number; y: number; anchor?: "start" | "middle" | "end" }) {
  if (exp >= -2 && exp <= 2) {
    return (
      <text x={x} y={y} textAnchor={anchor}>
        {String(10 ** exp >= 1 ? 10 ** exp : (10 ** exp).toFixed(-exp))}
      </text>
    );
  }
  return (
    <text x={x} y={y} textAnchor={anchor}>
      10
      <tspan dy="-4.5" fontSize="0.75em">
        {exp < 0 ? `−${-exp}` : String(exp)}
      </tspan>
    </text>
  );
}

/**
 * Round a computed SVG coordinate to 0.01. Node and the browser can disagree in
 * the last bit of Math.log10, Math.pow and friends, which would otherwise break
 * hydration; rounding makes server and client attributes identical.
 */
export function px(v: number): number {
  return Math.round(v * 100) / 100;
}

/** A percentage for an inline style, rounded for the same reason as px(). */
export function pctOf(value: number, max = 1): string {
  return `${(Math.max(0, Math.min(1, value / max)) * 100).toFixed(2)}%`;
}

/** Fixed-precision number formatting that renders the same on the server and in the browser. */
export function fmt(x: number, digits = 3): string {
  return x.toFixed(digits);
}

/** Thousands separators without locale differences between server and browser. */
export function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
