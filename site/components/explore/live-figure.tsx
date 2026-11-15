"use client";

// The two story figures (the helix and sickle haemoglobin) count toward the
// page's live WebGL budget too. They are pinned: mounted whenever any part of
// them is on screen, and unmounted (context released) when they scroll away.

import { useRef } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { DNAHelix, ProteinViewer } from "@/components/viz-lazy";
import { useLiveSlot } from "@/components/viz/gallery/slots";

function Pinned({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { live } = useLiveSlot(ref, true);
  return (
    <div ref={ref} className="size-full">
      {live ? children : <Skeleton className="size-full rounded-md" aria-hidden="true" />}
    </div>
  );
}

export function StoryHelix({
  sequence,
  changeIndex,
  from,
  to,
}: {
  sequence: string;
  changeIndex: number;
  from: string;
  to: string;
}) {
  return (
    <Pinned>
      <DNAHelix sequence={sequence} highlights={[{ index: changeIndex, from, to }]} autoRotate className="size-full" />
    </Pinned>
  );
}

export function StoryProtein({ pdbId, chains, residue }: { pdbId: string; chains: string[]; residue: number }) {
  return (
    <Pinned>
      <ProteinViewer
        pdbId={pdbId}
        highlightResidues={chains.map((chain) => ({ chain, residue }))}
        className="size-full"
      />
    </Pinned>
  );
}
