"use client";

// The figure beside the Explore heading: one molecule, live while it is on
// screen (it ranks ahead of the gallery for a slot), over its own still.

import { useCallback, useRef, useState } from "react";

import { MoleculePoster, MoleculeView } from "@/components/viz/gallery/lazy";
import { LiveMount } from "@/components/viz/gallery/LiveBoundary";
import { useLiveView } from "@/components/viz/gallery/slots";
import { cn } from "@/lib/utils";

export function HeroSpecimen({ name, caption, className }: { name: string; caption: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { mounted, lose } = useLiveView(ref, true);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <figure className={className}>
      <div
        ref={ref}
        className="relative aspect-[4/3] w-full bg-[radial-gradient(ellipse_at_50%_45%,var(--muted),transparent_68%)]"
      >
        <div className={cn("absolute inset-0 transition-opacity duration-500", mounted && ready && "opacity-0")}>
          <MoleculePoster name={name} className="size-full" />
        </div>
        {mounted && (
          <LiveMount onError={lose} setReady={setReady}>
            <MoleculeView name={name} onReady={onReady} className="size-full" />
          </LiveMount>
        )}
      </div>
      <figcaption className="mt-1 text-center font-mono text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
