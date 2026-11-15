"use client";

// One gallery card: a 3D view, a title, one fact and its source. The view is
// live only while the card holds one of the page's WebGL slots; otherwise the
// card shows a still of the same thing and says how to wake it.

import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { MoleculePoster, MoleculeView, StructureView } from "@/components/viz-lazy";
import { sourceOf, type GalleryItem } from "@/components/viz/gallery/catalog";
import { useLiveSlot } from "@/components/viz/gallery/slots";
import { cn } from "@/lib/utils";

function Formula({ formula }: { formula: [string, number][] }) {
  return (
    <>
      {formula.map(([el, n]) => (
        <span key={el}>
          {el}
          {n > 1 && <sub className="text-[0.75em]">{n}</sub>}
        </span>
      ))}
    </>
  );
}

function Poster({ item, hidden }: { item: GalleryItem; hidden: boolean }) {
  const fade = cn("absolute inset-0 transition-opacity duration-500", hidden && "opacity-0");
  if (item.kind === "molecule") {
    return (
      <div className={fade}>
        <MoleculePoster name={item.id} className="size-full" />
      </div>
    );
  }
  return (
    <div className={fade} aria-hidden="true">
      {(["light", "dark"] as const).map((mode) => (
        <Image
          key={mode}
          src={`/gallery/posters/${item.id.toLowerCase()}-${mode}.webp`}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 33vw, 100vw"
          className={cn("object-contain", mode === "light" ? "dark:hidden" : "hidden dark:block")}
        />
      ))}
    </div>
  );
}

/** Mounted only while the card is live, so `ready` resets with the view. */
function Live({ item, onReady }: { item: GalleryItem; onReady: (ready: boolean) => void }) {
  useEffect(() => () => onReady(false), [onReady]);
  return item.kind === "molecule" ? (
    <MoleculeView name={item.id} onReady={() => onReady(true)} className="size-full" />
  ) : (
    <StructureView pdbId={item.id} accents={item.accents} turn={item.turn} onReady={() => onReady(true)} className="size-full" />
  );
}

export function GalleryCard({
  item,
  wide = false,
  className,
}: {
  item: GalleryItem;
  /** A featured card: the view sits beside the text on wide screens. */
  wide?: boolean;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const hover = useRef<number | undefined>(undefined);
  const { live, claim } = useLiveSlot(frame);
  const [ready, setReady] = useState(false);
  const source = sourceOf(item);
  const moving = live && ready;

  useEffect(() => () => window.clearTimeout(hover.current), []);

  return (
    <article
      data-gallery-item={item.id}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/25",
        wide && "lg:flex-row",
        className,
      )}
    >
      <div
        ref={frame}
        tabIndex={0}
        aria-label={`${item.title}, 3D view`}
        onClick={claim}
        onFocus={claim}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || live) return;
          hover.current = window.setTimeout(claim, 160);
        }}
        onPointerLeave={() => window.clearTimeout(hover.current)}
        className={cn(
          "relative isolate aspect-[4/3] w-full shrink-0 bg-[radial-gradient(ellipse_at_50%_38%,var(--muted),transparent_72%)] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
          wide && "lg:aspect-auto lg:min-h-[23rem] lg:w-1/2",
        )}
      >
        <Poster item={item} hidden={moving} />
        {live && <Live item={item} onReady={setReady} />}
        <span className="pointer-events-none absolute top-3 left-3.5 font-mono text-xs tracking-wide text-muted-foreground">
          {item.kind === "structure" ? `PDB ${item.id}` : <Formula formula={item.formula} />}
        </span>
        <span
          className={cn(
            "pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2 py-0.5 font-mono text-[0.65rem] tracking-wide text-muted-foreground backdrop-blur-sm transition-opacity",
            moving && "opacity-0 group-hover:opacity-100",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", moving ? "bg-brand" : "border border-muted-foreground/70")}
          />
          {moving ? "Live · drag to turn" : live ? "Loading 3D" : "Still · hover or tap for 3D"}
        </span>
      </div>
      <div className={cn("flex flex-1 flex-col border-t p-5", wide && "lg:justify-center lg:border-t-0 lg:border-l lg:p-8")}>
        {wide && <p className="eyebrow mb-3">Bound drug · the assay view</p>}
        <h3 className={cn("font-display leading-tight", wide ? "text-3xl sm:text-4xl" : "text-2xl")}>{item.title}</h3>
        <p className={cn("mt-2 text-sm leading-relaxed text-muted-foreground", wide && "sm:text-base")}>{item.fact}</p>
        {item.kind === "structure" && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground/90">{item.legend}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-5">
          <a
            href={source.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
          >
            {source.label}
            <ArrowUpRightIcon className="size-3" aria-hidden="true" />
          </a>
          <span className="font-mono text-xs text-muted-foreground">
            {item.kind === "structure" ? item.meta : `${item.formula.reduce((n, [, c]) => n + c, 0)} atoms`}
          </span>
        </div>
      </div>
    </article>
  );
}
