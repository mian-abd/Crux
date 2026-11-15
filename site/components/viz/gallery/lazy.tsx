"use client";

// Client-only loaders for the Explore page's views. Each one imports its own
// module, never the components/viz barrel, so the page compiles and loads
// only what it shows: nothing here reaches the evidence graph or its
// force-graph library. The callers draw a still underneath, so the loaders
// render nothing of their own while the chunk arrives.

import dynamic from "next/dynamic";

export const MoleculeView = dynamic(() => import("./MoleculeView").then((m) => m.MoleculeView), {
  ssr: false,
  loading: () => null,
});

export const StructureView = dynamic(() => import("./StructureView").then((m) => m.StructureView), {
  ssr: false,
  loading: () => null,
});

export const MoleculePoster = dynamic(() => import("./MoleculePoster").then((m) => m.MoleculePoster), {
  ssr: false,
  loading: () => null,
});

export const DNAHelix = dynamic(() => import("../DNAHelix").then((m) => m.DNAHelix), {
  ssr: false,
  loading: () => null,
});

export const ProteinViewer = dynamic(() => import("../ProteinViewer").then((m) => m.ProteinViewer), {
  ssr: false,
  loading: () => null,
});
