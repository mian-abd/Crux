"use client";

import { FileUpIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "error"; message: string };

export function UploadDropzone({ className }: { className?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading";

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPhase({ kind: "error", message: "That file is not a PDF." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase({ kind: "error", message: "The PDF is larger than 20 MB." });
      return;
    }
    setPhase({ kind: "uploading", name: file.name });
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/papers", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setPhase({ kind: "error", message: data.error ?? "The upload failed. Try again." });
        return;
      }
      router.push(`/app/papers/${data.id}`);
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "The upload failed. Check your connection and try again." });
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        aria-describedby="upload-status"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-10 text-center transition-colors",
          "hover:border-foreground/40 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
          over && "border-brand bg-brand/5",
          busy && "cursor-progress opacity-80",
        )}
      >
        {busy ? (
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <FileUpIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="font-medium">
          {busy ? `Reading ${phase.name}…` : "Drop a PDF here, or choose a file"}
        </span>
        <span className="max-w-sm text-sm text-muted-foreground">
          {busy
            ? "Storing the file and extracting its text on the server."
            : "Up to 20 MB. The file stays on this server and its text is extracted there."}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p id="upload-status" role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-destructive">
        {phase.kind === "error" ? phase.message : ""}
      </p>
    </div>
  );
}
