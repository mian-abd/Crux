import type { Metadata } from "next";
import Image from "next/image";

import { PageHeader } from "@/components/app/page-header";
import { UploadDropzone } from "@/components/app/upload-dropzone";

export const metadata: Metadata = { title: "Upload a paper" };

const FACTS = [
  {
    term: "Where it goes",
    body: "The file is kept on this server under your account. Nobody else can list or open it.",
  },
  {
    term: "What is sent out",
    body: "Nothing on upload. Extracting claims sends the paper's text to the model provider.",
  },
  {
    term: "What can be checked",
    body: "Claims that match the four curated ones. The rest are listed as not yet checkable.",
  },
];

export default function UploadPage() {
  return (
    <div className="space-y-10">
      <PageHeader title="Upload a paper">
        One PDF at a time. Text is extracted on the server; scanned pages without a text layer can&apos;t be read yet.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <UploadDropzone />
          <dl className="grid gap-3 sm:grid-cols-3">
            {FACTS.map((f) => (
              <div key={f.term} className="rounded-2xl border bg-card p-5">
                <dt className="font-medium">{f.term}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="flex flex-col">
          <div className="overflow-hidden rounded-2xl border bg-[#f7f6f3]">
            <Image
              src="/plates/hooke-flea.jpg"
              alt="Robert Hooke's 1665 engraving of a flea seen under a microscope."
              width={1920}
              height={1440}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="h-full w-full object-cover"
            />
          </div>
          <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Look closely before you believe it. Robert Hooke, Micrographia (1665), Schem. XXXIV. Public domain.
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
