# Crux site

The consumer-facing web app: a landing page, accounts, paper upload with claim extraction,
and a live view of a claims audit run. The engineering run viewer stays in `web/`.

## Run it

Two servers. From the repository root, the engine API:

```sh
CRUX_CORS_ORIGINS=http://localhost:3000 uv run uvicorn api.server:app --port 8001
```

Then the site:

```sh
cd site
npm ci
npm run dev        # http://localhost:3000
```

The site runs without the API: the run page then plays a bundled fixture and says so.
`npm run build`, `npm run lint`, `npm test` and `npm run typecheck` should all pass.

### Environment

Copy `.env.example` to `.env.local`. Nothing in it is required for a first run.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Claim extraction. Server only; it never reaches the browser. Without it the paper page shows "Extraction needs an API key". |
| `OPENAI_MODEL` | Optional extraction model, default `gpt-4.1-mini`. |
| `BETTER_AUTH_SECRET` | Signs session cookies. If unset, a random secret is generated once into `.data/auth-secret`. |
| `BETTER_AUTH_URL` | Optional public URL when the site is not on `http://localhost:3000`. |
| `NEXT_PUBLIC_CRUX_API` | The engine API, default `http://localhost:8001`. |

The API reads `CRUX_CORS_ORIGINS` (comma-separated) and adds those origins to the ones
it already allows. The browser streams run events straight from the API, so the site's
origin has to be listed there.

### Data

Everything local lives in `site/.data/`, which is gitignored: `crux.sqlite` (accounts,
sessions, papers and their claims), `uploads/<user>/` (the PDFs) and `auth-secret`.
Accounts are email and password only, stored by Better Auth with hashed passwords and
httpOnly session cookies. No third-party service holds an account.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page. Every number carries the repo path it comes from. |
| `/explore` | The 3D gallery: the sickle-cell change from the DNA letter to the protein, then DNA, protein and small-molecule structures. Public. |
| `/app/explore` | The same gallery inside the signed-in app shell, so the sidebar stays. Both pages render `components/explore/explore-content.tsx`. |
| `/signup`, `/login` | Accounts. |
| `/app` | Your papers. `/app/upload` uploads a PDF and extracts its text on the server. |
| `/app/papers/[id]` | The paper's claims, split into "Checkable now" and "Not yet checkable". |
| `/app/runs/[id]` | A claims audit, streamed from the engine API. `/app/runs/demo` is the recorded run. |

`/app/*` is guarded twice: `proxy.ts` redirects on a missing session cookie, and the
`/app` layout checks the session against the database.

### Where the run page gets its events

1. A live run, when `GET /tasks` lists the `claims` lab: `POST /runs {"lab": "claims"}`, then
   `GET /runs/{id}/events`. It needs no API key and takes a few seconds.
2. `/app/runs/demo` plays the recorded run `runs/demo/claims_deseq2.jsonl` through `/replays`, labelled
   "Replay of a recorded run".
3. If the API cannot be reached: `public/fixtures/demo_claims.jsonl`, a hand-written UI fixture copied from
   `web/public/fixtures/`. The page labels it as a fixture, not a recorded run.

The event types, the fold and the claims derivation in `lib/crux/` are copies of
`web/src/types.ts`, `web/src/state/fold.ts`, `web/src/state/selectors.ts` and
`web/src/state/claims.ts`, so both views read a run the same way. Nothing is imported
across folders; when those files change, copy them again.

### Claim extraction

`lib/claim-library.ts` lists the four curated claims the engine can check. Extraction
sends the paper's text (the first 60,000 characters) to the model with a strict JSON
schema, and `lib/extract.ts` checks the reply: an unknown library id becomes "no match",
and each quote is looked up in the paper's text and flagged when it is not there word
for word.

### 3D components

Pages import `HeroScene`, `DNAHelix`, `ProteinViewer` and `EvidenceGraph3D` from
`@/components/viz`, lazily and client-side only (`components/viz-lazy.tsx`).
The Explore gallery adds `MoleculeView`, `MoleculePoster` and `StructureView` from
`components/viz/gallery/`; its cards mount a live view only while they hold one of three
page-wide WebGL slots and show a still otherwise (see `components/viz/README.md`).
`components/viz/placeholder.tsx` holds flat stand-ins with the same names and props until
the 3D library lands in that folder.

## Built from

Assembled from these templates and libraries, then adapted. Licences were read from each
package's `package.json` or repository.

| Source | Used for | Licence |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com) (`base-nova` style, CLI 4.23.0) | `components/ui/*`, the `login-01` and `signup-01` blocks, the sidebar layout | MIT |
| [Magic UI](https://magicui.design) | `components/ui/animated-beam.tsx` (the loop diagram) | MIT |
| [Better Auth](https://www.better-auth.com) | Email and password accounts, sessions | MIT |
| [Next.js](https://nextjs.org) (App Router), [React](https://react.dev) | Framework | MIT |
| [Tailwind CSS](https://tailwindcss.com), [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css), [tailwind-merge](https://github.com/dcastil/tailwind-merge), [clsx](https://github.com/lukeed/clsx), [class-variance-authority](https://cva.style) | Styling | MIT, except class-variance-authority (Apache-2.0) |
| [Base UI](https://base-ui.com) | Accessible primitives under shadcn/ui | MIT |
| [Motion](https://motion.dev) | The beam animation | MIT |
| [Lucide](https://lucide.dev) | Icons | ISC |
| [next-themes](https://github.com/pacocoursey/next-themes), [Sonner](https://sonner.emilkowal.ski) | Theme switch, toasts | MIT |
| [Node.js `node:sqlite`](https://nodejs.org/api/sqlite.html) | SQLite driver, built into Node (no package) | MIT |
| [unpdf](https://github.com/unjs/unpdf) (bundles PDF.js, Apache-2.0) | PDF text extraction | MIT |
| [three](https://threejs.org), [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei), [react-force-graph-3d](https://github.com/vasturiano/react-force-graph), [Mol*](https://molstar.org) | Dependencies of the 3D library | MIT |
| [three.js molecules example](https://threejs.org/examples/#webgl_loader_pdb) (`examples/webgl_loader_pdb.html`, `PDBLoader`, and nine files from `examples/models/pdb/`, tag r187) | The small-molecule views and `public/molecules/*.pdb` | MIT |
| [Geist](https://vercel.com/font), [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) | Typefaces, loaded with `next/font` | SIL Open Font License 1.1 |

Content credits: the claims audit uses Love MI, Huber W, Anders S, "Moderated estimation
of fold change and dispersion for RNA-seq data with DESeq2", Genome Biology 15, 550
(2014), [doi:10.1186/s13059-014-0550-8](https://doi.org/10.1186/s13059-014-0550-8),
CC BY 4.0. The Explore page uses NCBI RefSeq NM_000518.5 and PDB entries 2HBS and 1A3N; its gallery
loads PDB entries 1BNA, 1YTB, 4OO8, 4HHB, 1EMA, 4INS, 6VXX and 1HSG from RCSB PDB at run
time (wwPDB data, CC0 1.0) and links each small molecule to its PubChem compound page.
The design takes no code, logo, typeface or text from any other organisation's site.
