import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { UploadDropzone } from "@/components/app/upload-dropzone";

export const metadata: Metadata = { title: "Upload a paper" };

export default function UploadPage() {
  return (
    <div className="space-y-10">
      <PageHeader title="Upload a paper">
        One PDF at a time. Text is extracted on the server; scanned pages without a text layer
        can&apos;t be read yet.
      </PageHeader>
      <UploadDropzone className="max-w-2xl" />
      <dl className="grid max-w-2xl gap-6 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-medium">Where it goes</dt>
          <dd className="mt-1 leading-relaxed text-muted-foreground">
            The file is kept on this server under your account. Nobody else can list or open it.
          </dd>
        </div>
        <div>
          <dt className="font-medium">What is sent out</dt>
          <dd className="mt-1 leading-relaxed text-muted-foreground">
            Nothing on upload. Extracting claims sends the paper&apos;s text to the model provider.
          </dd>
        </div>
        <div>
          <dt className="font-medium">What can be checked</dt>
          <dd className="mt-1 leading-relaxed text-muted-foreground">
            Claims that match the four curated ones. The rest are listed as not yet checkable.
          </dd>
        </div>
      </dl>
    </div>
  );
}
