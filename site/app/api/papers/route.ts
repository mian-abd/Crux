import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

import { currentUser } from "@/lib/server/auth";
import { MAX_UPLOAD_BYTES, looksLikePdf, savePaper } from "@/lib/server/papers";

export const runtime = "nodejs";

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "Cross-site uploads are not accepted.");
  const user = await currentUser();
  if (!user) return fail(401, "Sign in to upload a paper.");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "The PDF is larger than 20 MB.");

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return fail(400, "The upload could not be read.");
  }
  if (!file) return fail(400, "No file was sent.");
  if (file.size === 0) return fail(400, "The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, "The PDF is larger than 20 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) return fail(415, "That file is not a PDF.");

  let pages = 0;
  let text = "";
  try {
    // unpdf takes ownership of the buffer it is given, so hand it a copy.
    const pdf = await getDocumentProxy(bytes.slice());
    const result = await extractText(pdf, { mergePages: true });
    pages = result.totalPages;
    text = result.text.trim();
  } catch {
    return fail(422, "The PDF could not be opened. It may be damaged or password protected.");
  }
  if (text.length < 200) {
    return fail(
      422,
      "No text could be read from this PDF. Scanned pages need OCR, which is not supported yet.",
    );
  }

  const id = await savePaper({ userId: user.id, filename: file.name, bytes, pages, text });
  return NextResponse.json({ id });
}
