"use client";

// The two story figures (the helix and sickle haemoglobin) count toward the
// page's live WebGL budget too. They rank ahead of the gallery cards for a
// slot while on screen, and unmount (context released) when they scroll
// away. Underneath each is a still that costs no WebGL context: an SVG of
// the same helix, and a quiet frame for the protein. The still is what
// shows while the view loads, and if the browser takes its context back.

import { useCallback, useRef, useState, type ReactNode } from "react";

import { DNAHelix, ProteinViewer } from "@/components/viz/gallery/lazy";
import { HelixPoster } from "@/components/viz/HelixPoster";
import { LiveMount } from "@/components/viz/gallery/LiveBoundary";
import { useLiveView } from "@/components/viz/gallery/slots";
import { cn } from "@/lib/utils";

function Figure({
  still,
  children,
}: {
  still: ReactNode;
  children: (onReady: () => void, onError: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { mounted, lose } = useLiveView(ref, true);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div ref={ref} className="relative size-full">
      <div className={cn("absolute inset-0 transition-opacity duration-700", mounted && ready && "opacity-0")}>
        {still}
      </div>
      {mounted && (
        <LiveMount onError={lose} setReady={setReady}>
          <div className="absolute inset-0">{children(onReady, lose)}</div>
        </LiveMount>
      )}
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
  const highlights = [{ index: changeIndex, from, to }];
  return (
    <Figure still={<HelixPoster sequence={sequence} highlights={highlights} className="size-full" />}>
      {(onReady) => (
        <DNAHelix sequence={sequence} highlights={highlights} autoRotate onReady={onReady} className="size-full" />
      )}
    </Figure>
  );
}

export function StoryProtein({ pdbId, chains, residue }: { pdbId: string; chains: string[]; residue: number }) {
  return (
    <Figure
      still={
        <div className="grid size-full place-items-center bg-[radial-gradient(ellipse_at_50%_45%,var(--muted),transparent_70%)]">
          <span className="font-mono text-xs tracking-wide text-muted-foreground">PDB {pdbId.toUpperCase()}</span>
        </div>
      }
    >
      {(onReady, onError) => (
        <ProteinViewer
          pdbId={pdbId}
          highlightResidues={chains.map((chain) => ({ chain, residue }))}
          onReady={onReady}
          onError={onError}
          className="size-full"
        />
      )}
    </Figure>
  );
}
