"use client";

// The 3D components are client-only and loaded after first paint. Each wrapper
// reserves its final size, so nothing shifts when the scene arrives.
//
// The Explore views (molecules, structures, the helix, the protein viewer)
// load from components/viz/gallery/lazy, which never touches the
// components/viz barrel; they are re-exported here for other pages.

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

export {
  DNAHelix,
  MoleculePoster,
  MoleculeView,
  ProteinViewer,
  StructureView,
} from "@/components/viz/gallery/lazy";

function Loading() {
  return <Skeleton className="size-full min-h-24 rounded-lg" aria-label="Loading visual" />;
}

export const HeroScene = dynamic(() => import("@/components/viz/HeroScene").then((m) => m.HeroScene), {
  ssr: false,
  loading: () => null,
});

export const EvidenceGraph3D = dynamic(
  () => import("@/components/viz").then((m) => m.EvidenceGraph3D),
  { ssr: false, loading: Loading },
);
