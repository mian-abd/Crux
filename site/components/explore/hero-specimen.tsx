"use client";

// The figure beside the Explore heading: one molecule, live while it is on
// screen (it holds a pinned slot), over its own still.

import { useRef, useState } from "react";

import { MoleculePoster, MoleculeView } from "@/components/viz-lazy";
import { useLiveSlot } from "@/components/viz/gallery/slots";
import { cn } from "@/lib/utils";

export function HeroSpecimen({ name, caption, className }: { name: string; caption: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { live } = useLiveSlot(ref, true);
  const [ready, setReady] = useState(false);
  return (
    <figure className={className}>
      <div
        ref={ref}
        className="relative aspect-[4/3] w-full bg-[radial-gradient(ellipse_at_50%_45%,var(--muted),transparent_68%)]"
      >
        <div className={cn("absolute inset-0 transition-opacity duration-500", live && ready && "opacity-0")}>
          <MoleculePoster name={name} className="size-full" />
        </div>
        {live && <MoleculeView name={name} onReady={() => setReady(true)} className="size-full" />}
      </div>
      <figcaption className="mt-1 text-center font-mono text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
