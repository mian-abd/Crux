// The only place the OpenAI key is read. It stays on the server: this module is
// imported by server actions only, and the key is never part of a response.

import {
  EXTRACTION_SCHEMA,
  clipPaperText,
  extractionMessages,
  normalizeExtraction,
  type Extraction,
} from "@/lib/extract";

export const EXTRACTION_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export class ExtractionError extends Error {}

export async function extractClaims(
  paperText: string,
): Promise<Extraction & { truncated: boolean; model: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ExtractionError("Extraction needs an API key.");
  const { text, truncated } = clipPaperText(paperText);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        messages: extractionMessages(text),
        response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ExtractionError("The model provider could not be reached. Try again.");
  }
  if (!res.ok) {
    // The provider's error body is not passed on: it can echo request details.
    const hint =
      res.status === 401
        ? "The API key was rejected."
        : res.status === 429
          ? "The API key is rate limited or out of quota."
          : `The model provider answered ${res.status}.`;
    throw new ExtractionError(hint);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };
  const message = data.choices?.[0]?.message;
  if (!message?.content) {
    throw new ExtractionError(
      message?.refusal ? "The model declined to read this paper." : "The model returned nothing.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    throw new ExtractionError("The model's reply was not valid JSON.");
  }
  return { ...normalizeExtraction(parsed, text), truncated, model: EXTRACTION_MODEL };
}
