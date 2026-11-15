# `components/viz`: the 3D views

Four client components and a few pure modules, imported from `@/components/viz`. The site
loads the components through `components/viz-lazy.tsx` (`next/dynamic`, `ssr: false`).

| Export | Props | What it draws |
| --- | --- | --- |
| `HeroScene` | `className?` | Landing background: a B-DNA helix of HBB, turning slowly about its own axis and receding into fog, over a faint particle field. One pair (HBB c.20A>T, codon 6) is drawn in the accent. |
| `DNAHelix` | `sequence?`, `highlights?`, `autoRotate?`, `className?` | Interactive helix of `sequence` (default: the first 27 nt of HBB, NM_000518.5). Each highlight is drawn larger and in the accent, with a glow and a label such as `codon 6: GAG → GTG` (changed letters in bold) over `Glu → Val · c.20A>T`. Orbit with the mouse; it spins about its axis until you do, and resumes after 8 s. Hover a pair to name it. |
| `ProteinViewer` | `pdbId`, `highlightResidues?`, `className?` | A Mol* view with no Mol* interface: muted cartoon, soft ambient occlusion and outlines, hemes as thin sticks, highlighted residues as accent ball-and-stick inside a translucent shell. The camera turns the residues toward the viewer, or keeps Mol*'s principal-axes view when they surround the centre (2HBS). Loading, not-found and offline states are spelled out. |
| `EvidenceGraph3D` | `events`, `height?`, `className?` | The run's evidence graph, built live from its events (see below). |

Also exported: `buildGraph` and `parseEventLog` (the pure event-to-graph reducer), the
`RunEvent` type, the palette and constants from `theme.ts`, and the HBB helpers from
`sequence.ts` (`HBB_FIRST_27`, `SICKLE_HIGHLIGHT`, `describeHighlight`, ...). `theme.ts`,
`graph.ts` and `sequence.ts` have no browser code and are safe in server components.

## The gallery (`gallery/`)

The Explore page's views. Pages load them through `components/viz-lazy.tsx`.

| Export | Props | What it draws |
| --- | --- | --- |
| `MoleculeView` | `name`, `labels?`, `onReady?`, `className?` | A small molecule from `/public/molecules/<name>.pdb` as ball-and-stick: CPK colours tuned to the site tokens, studio lighting, slow auto-rotate, drag to orbit (mouse and pen; on touch it only turns, so a swipe scrolls the page). Nitrogen, oxygen and other heteroatoms carry their letter as DOM labels on the shared label system (`ScreenLabels.tsx`); letters on the far side fade. |
| `MoleculePoster` | `name`, `className?` | The same molecule in the same opening pose as SVG. No WebGL context. |
| `StructureView` | `pdbId`, `accents?`, `turn?`, `onReady?`, `className?` | A PDB entry through the headless Mol* setup of `ProteinViewer` (it reuses its fetch and canvas styling): protein chains as grey cartoon, nucleic acids in the accent, other ligands as thin sticks, and each `accents` entry (component ids such as `HEM`, `MK1`, `CRO`, `ZN`) as ball-and-stick or spheres in a status colour. It turns slowly; the wheel is left to the page. |
| `useLiveSlot`, `MAX_LIVE_VIEWS` | `(ref, pinned?)` | The page-wide budget of live WebGL views (`slots.ts`). At most three are mounted. Order: pinned views (the hero molecule and the two story figures), then the card last hovered, clicked or focused, then cards already live, then page order. A view that leaves the screen is unmounted and its context released. |
| `GENOMICS`, `PROTEINS`, `DRUG_COMPLEX`, `MOLECULES`, `sourceOf` | | The catalogue (`catalog.ts`): ids, titles, one fact each, and the source link. |

A card that is not live shows a still: `MoleculePoster` for molecules, and for structures a WebP
in `public/gallery/posters/<id>-<light|dark>.webp`. Those 16 files are the live view's own
first frame, captured from this code in headless Chrome at reduced motion (so no spin) on a
transparent background; recapture them if the styling in `StructureView` changes.

What is shown, and where it comes from:

| Item | Source | Licence |
| --- | --- | --- |
| 1BNA B-DNA dodecamer, 1YTB TATA-binding protein on DNA, 4OO8 Cas9 with guide RNA and target DNA, 4HHB deoxyhaemoglobin, 1EMA green fluorescent protein, 4INS 2Zn pig insulin, 6VXX SARS-CoV-2 spike (closed), 1HSG HIV protease with L-735,524 | RCSB PDB (`models.rcsb.org`), PDBe as fallback, fetched at run time | wwPDB data, CC0 1.0 |
| caffeine, aspirin, glucose, nicotine, cholesterol, ethanol, cubane, buckyball (C60), graphite | `examples/models/pdb/` in three.js r187, copied unchanged to `public/molecules/` | MIT (three.js) |

Each structure's caption was checked against the entry's title, method and resolution on
rcsb.org. Each molecule's formula was checked against the atoms in its file and against the
PubChem compound the card links to (CIDs 2519, 2244, 5793, 89594, 5997, 702, 136090, 123591,
5462310).

## Conventions

* **Highlight index.** `highlights[].index` is 0-based into `sequence`; `from`/`to` are single bases
  (`{ index: 19, from: "A", to: "T" }` is HbS) or whole codons starting at `index`. Codon numbers
  use the legacy HBB numbering (the initiator ATG is codon 0), so index 19 is codon 6.
* **Residues.** `highlightResidues[].chain` is the author chain id and `residue` the author residue
  number (`{ chain: "B", residue: 6 }`). For 2HBS and 1A3N these equal the label ids.
* **Structures** load from RCSB (`models.rcsb.org/<id>.bcif`), then PDBe (`<id>_updated.cif`). The
  deposited model is shown, so 2HBS shows both tetramers and the β6 contact between them.
* **Colour.** `PALETTE` is the site's tokens (`app/globals.css`: `--brand`, `--v-holds`,
  `--v-refuted`, `--v-cond`, `--v-unresolved`, `--v-open`, surfaces) converted to hex for three.js
  and Mol*. Light or dark follows the `dark` class or `data-theme` on `<html>` (next-themes), then
  `color-scheme`, then the OS. Fog fades to the colour actually painted behind each view.
* **Motion.** With `prefers-reduced-motion` the hero and helix draw one still frame, the graph does
  not orbit or pulse, and Mol* does not rock. Every view stops drawing when off-screen or when the
  tab is hidden (IntersectionObserver plus `visibilitychange`).
* **Cleanup.** Each view releases its WebGL context on unmount (R3F does it for the two helices; the
  graph and Mol* force it), and resizes with its container.
* **Helix labels.** `DNAHelix`'s labels are ordinary DOM in the page's React tree, laid over the
  canvas (`ScreenLabels.tsx`). An empty group in the scene marks each anchor, and one frame callback
  projects the anchors and writes each label's transform, z-index and visibility (`labelStore.ts`,
  the same maths as drei's `Html`). drei's `Html` is not used: it renders into a React root of its
  own and unmounts it synchronously, which React 19 reports as an error under StrictMode.

## The evidence graph

`buildGraph(events)` folds the event stream (fields as in `docs/EVENTS.md`) into nodes and links:

* **Nodes:** questions (large spheres), their options (spheres sized by the current posterior) and
  diagnostics (octahedra, from `experiment.proposed`, or `experiment.started` if never proposed).
* **Links:** option to question, diagnostic to each question it tests.
* **State:** `belief.updated` resizes options; `hypothesis.rejected` dims an option and strikes it
  through; `question.settled` rings the question and its winner (winner link in the accent);
  `question.unresolved` gives the question a dashed ring; `experiment.started`/`finished` pulse the
  diagnostic and send a particle along its links; `question.opened` with `reopened` clears the verdict.
* **Claims runs:** `claims.source` supplies each question's label (the claim text) and the source line.
  Answer keys map to `holds` (holds), `fails` / `alt_param` / `fails_conservative` (refuted) and
  `holds_if` (holds under a condition). Colour is never the only cue: the legend, the hover tooltips
  (claim, quote, status, posterior, rejection reason) and, for graphs of ten questions or fewer, the
  captions under each question carry the text.
* **Layout:** react-force-graph-3d's d3 simulation, warmed up before the first frame and cooled
  quickly. Node objects persist across updates, and nodes already placed are pinned while newcomers
  settle, so nothing jumps as events stream in. The camera eases toward the graph's bounding sphere
  (between the caption bands) and orbits slowly until the user takes over.

## Dependencies

Already pinned in `site/package.json`; nothing else is needed (no `transpilePackages`, no Mol* CSS:
no Mol* UI is mounted). React 19 is required by `@react-three/fiber` 9.

| Package | Version | Licence |
| --- | --- | --- |
| `three` | 0.187.0 | MIT |
| `@react-three/fiber` | 9.8.2 | MIT |
| `@react-three/drei` | 10.7.9 | MIT |
| `react-force-graph-3d` | 1.29.2 (brings `3d-force-graph` 1.80.2, `three-forcegraph` 1.43.6) | MIT |
| `molstar` | 5.13.1 | MIT |
| three.js example files (`public/molecules/*.pdb`) | r187 (three 0.187.0) | MIT |

`react-force-graph-3d` reads `window` at import time and Mol* is large, so both are imported inside
effects; the rest of the folder is safe to import on the server.

## Tests

The reducer and sequence helpers have unit tests in `__tests__/` (fixtures, the three recorded
logs in `runs/demo/`, malformed input, purity). The site's vitest config covers `lib/` only, so
run them with the folder's config, from `site/`:

```sh
npx vitest run --config components/viz/vitest.config.mts
```

(Adding `"components/viz/**/*.test.ts"` to `include` in `site/vitest.config.mts` would make them
part of `npm test`.)

## Performance

Measured in headless Chrome (ANGLE, D3D11) on an Intel Meteor Lake integrated GPU at 1440×900,
full-window, timing each frame with a forced GPU sync (`readPixels`) after it. The sync and
compositing cost what an empty R3F canvas with the same settings costs (1.6 ms at 1×, 2.7 ms at
2×), so a view's own cost is the difference.

| View | Device pixel ratio | Frame, CPU + GPU (mean / p95) | CPU | Over empty canvas |
| --- | --- | --- | --- | --- |
| `HeroScene` | 1 | 2.2 / 3.1 ms | 0.11 ms | about 0.6 ms |
| `HeroScene` | 2 (drawn at 1.5) | 3.4 / 3.9 ms | 0.12 ms | about 0.7 ms |
| `DNAHelix` | 2 (drawn at 1.75) | 3.4 / 3.9 ms | 0.11 ms | about 0.7 ms |
| `EvidenceGraph3D`, 124 nodes | 2 (drawn at 1.75) | 4.0 / 4.4 ms | 0.95 ms | about 1.3 ms |
| `ProteinViewer` 2HBS, 720×460 | 2 (drawn at 1.5) | 7.0 / 7.9 ms | under 0.1 ms | about 5.3 ms |

The gallery was checked in the same headless Chrome setup at 1440×900: a molecule is two
instanced draw calls (atoms, half-bonds) at a device pixel ratio capped at 1.5, with no
post-processing; `StructureView` keeps `ProteinViewer`'s 1.5× buffer cap and 0.6-resolution
ambient occlusion. No more than three contexts exist at once, off-screen views are unmounted,
and with `prefers-reduced-motion` nothing turns. Per-frame timings for the gallery views were
not measured.

The hero uses instancing (beads and bonds are one draw call each, plus two backbone tubes, the
highlighted pair and one particle system) and no post-processing. Mol*'s ambient occlusion runs at 0.6 resolution and the viewer caps its drawing
buffer at 1.5× device pixels; it only redraws while rocking or interacting.

Known development-only console noise: three 0.187 warns that `THREE.Clock` (used inside R3F) is
deprecated. It does not appear in production builds or affect behaviour.

## Sources and credits

Built from these open-source projects and their documented patterns; no code was copied beyond
what their APIs require.

* [three.js](https://github.com/mrdoob/three.js) (MIT): `InstancedMesh` for beads and bonds,
  `TubeGeometry` backbones, `RoomEnvironment` and `PMREMGenerator` for the graph's lighting,
  `CSS2DRenderer` for the graph captions.
* three.js [molecules example](https://threejs.org/examples/#webgl_loader_pdb)
  (`examples/webgl_loader_pdb.html`, MIT) and its `PDBLoader` addon: the gallery's small molecules
  start from it. The loader is used as shipped; the example's per-atom meshes and CSS2D labels
  became two instanced meshes and the shared DOM labels, and nine of its PDB files are in
  `public/molecules/`.
* [react-three-fiber](https://github.com/pmndrs/react-three-fiber) and
  [drei](https://github.com/pmndrs/drei) by Poimandres (MIT): `Canvas` with on-demand frame loops,
  `Environment` with `Lightformer`s (the procedural studio lighting from the pmndrs examples, so
  nothing is downloaded), `Sparkles`, `Float` and `OrbitControls`.
* [react-force-graph-3d](https://github.com/vasturiano/react-force-graph),
  [3d-force-graph](https://github.com/vasturiano/3d-force-graph) and
  [three-forcegraph](https://github.com/vasturiano/three-forcegraph) by Vasco Asturiano (MIT): the
  force layout, custom node objects (`nodeThreeObject`), per-link materials, `emitParticle`, orbit
  controls and HTML tooltips.
* [Mol*](https://github.com/molstar/molstar) (MIT; Sehnal et al., Nucleic Acids Research 2021): the
  headless `PluginContext` pattern from the Mol* plugin documentation, structure builders and
  MolScript selections, and the ambient-occlusion and outline settings of its `lighting` example.
* [PDBe Molstar](https://github.com/molstar/pdbe-molstar) (Apache-2.0, EMBL-EBI): the run viewer's
  `web/src/components/oneletter/StructurePanel.tsx` setup informed the residue and chain choices; it
  is not a dependency here.
* Data: NCBI RefSeq NM_000518.5 (HBB coding sequence; the same values as `web/src/lib/hbb.ts`);
  PDB entries 2HBS and 1A3N, and the gallery's 1BNA, 1YTB, 4OO8, 4HHB, 1EMA, 4INS, 6VXX and 1HSG,
  from RCSB PDB and PDBe (wwPDB data, CC0 1.0). B-DNA geometry uses the
  textbook values (about 10.5 bp per turn, 3.4 Å rise, unequal grooves).
