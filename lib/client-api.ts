import { parseGeneratedApp } from "@/lib/schemas";
import type {
  GeneratedApp,
  GenerateErrorCode,
  GenerateErrorPayload,
  GenerateRequest,
} from "@/types/ai";

export class GenerationRequestError extends Error {
  constructor(
    public readonly code: GenerateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GenerationRequestError";
  }
}

function hasErrorPayload(value: unknown): value is GenerateErrorPayload {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return false;
  }

  const error = value.error;
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}

export async function requestGeneration(
  input: GenerateRequest,
  onResponse?: () => void,
  fetcher: typeof fetch = fetch,
): Promise<GeneratedApp> {
  let response: Response;

  try {
    response = await fetcher("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new GenerationRequestError(
      "NETWORK_ERROR",
      "Network error. Check your connection and try again.",
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (hasErrorPayload(payload)) {
      throw new GenerationRequestError(payload.error.code, payload.error.message);
    }

    throw new GenerationRequestError(
      "AI_UPSTREAM_ERROR",
      "Generation failed. Please try again.",
    );
  }

  onResponse?.();

  try {
    return parseGeneratedApp(JSON.stringify(payload));
  } catch {
    throw new GenerationRequestError(
      "INVALID_MODEL_RESPONSE",
      "The AI returned an invalid application. Please retry.",
    );
  }
}
