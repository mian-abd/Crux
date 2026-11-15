// A quiet pointer from the landing page to the Explore gallery. The three
// thumbnails are SVG stills of real molecules (no WebGL on this page for them).

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { MoleculePoster } from "@/components/viz-lazy";

const THUMBS = [
  { name: "caffeine", label: "Caffeine" },
  { name: "glucose", label: "Glucose" },
  { name: "buckyball", label: "C60" },
];

export function GalleryStrip() {
  return (
    <section aria-labelledby="gallery-strip-heading" className="border-t">
      <Link
        href="/explore"
        className="group mx-auto flex w-full max-w-6xl flex-col gap-x-12 gap-y-8 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between"
      >
        <div className="max-w-md">
          <p className="eyebrow">Explore</p>
          <h2 id="gallery-strip-heading" className="mt-3 font-display text-3xl leading-tight">
            DNA, proteins and molecules, in 3D.
          </h2>
          <p className="mt-3 text-muted-foreground">
            A gallery of real structures you can turn, starting from the one DNA letter behind
            sickle-cell disease.
          </p>
          <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-border underline-offset-4 group-hover:decoration-foreground">
            Open the gallery
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </p>
        </div>
        <ul aria-hidden="true" className="grid w-full max-w-xl grid-cols-3 gap-3">
          {THUMBS.map((t) => (
            <li key={t.name} className="rounded-lg border bg-card transition-colors group-hover:border-foreground/25">
              <div className="aspect-[4/3] w-full">
                <MoleculePoster name={t.name} className="size-full" />
              </div>
              <p className="border-t px-3 py-2 font-mono text-xs text-muted-foreground">{t.label}</p>
            </li>
          ))}
        </ul>
      </Link>
    </section>
  );
}
