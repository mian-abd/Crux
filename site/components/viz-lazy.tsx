"use client";

// The 3D components are client-only and loaded after first paint. Each wrapper
// reserves its final size, so nothing shifts when the scene arrives.

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

function Loading() {
  return <Skeleton className="size-full min-h-24 rounded-lg" aria-label="Loading visual" />;
}

export const HeroScene = dynamic(() => import("@/components/viz").then((m) => m.HeroScene), {
  ssr: false,
  loading: () => null,
});

export const DNAHelix = dynamic(() => import("@/components/viz").then((m) => m.DNAHelix), {
  ssr: false,
  loading: Loading,
});

export const ProteinViewer = dynamic(() => import("@/components/viz").then((m) => m.ProteinViewer), {
  ssr: false,
  loading: Loading,
});

export const EvidenceGraph3D = dynamic(
  () => import("@/components/viz").then((m) => m.EvidenceGraph3D),
  { ssr: false, loading: Loading },
);

// The gallery's views. Their cards mount them only while they hold one of the
// page's live WebGL slots (components/viz/gallery/slots.ts).
export const MoleculeView = dynamic(
  () => import("@/components/viz/gallery/MoleculeView").then((m) => m.MoleculeView),
  { ssr: false, loading: () => null },
);

export const StructureView = dynamic(
  () => import("@/components/viz/gallery/StructureView").then((m) => m.StructureView),
  { ssr: false, loading: () => null },
);

export const MoleculePoster = dynamic(
  () => import("@/components/viz/gallery/MoleculePoster").then((m) => m.MoleculePoster),
  { ssr: false, loading: () => null },
);
