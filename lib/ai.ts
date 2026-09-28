import { APP_BUILDER_SYSTEM_PROMPT } from "@/prompts/app-builder";
import { validateGeneratedAppQuality } from "@/lib/generated-app-quality";
import {
  InvalidModelResponseError,
  parseGeneratedApp,
} from "@/lib/schemas";
import type {
  GeneratedApp,
  GenerateErrorCode,
  GenerateRequest,
} from "@/types/ai";

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

interface ProviderResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class AIClientError extends Error {
  constructor(
    public readonly code: Extract<
      GenerateErrorCode,
      "AI_TIMEOUT" | "AI_UPSTREAM_ERROR" | "NETWORK_ERROR"
    >,
    message: string,
  ) {
    super(message);
    this.name = "AIClientError";
  }
}

function providerUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function refinementContext(input: GenerateRequest) {
  if (!input.currentCode) {
    return `User request:\n${input.prompt}\n\nBuild the application from scratch.`;
  }

  return `User request:\n${input.prompt}\n\nRefine the current application while preserving all useful existing behavior.\nCurrent application source:\n${JSON.stringify(
    input.currentCode,
  )}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

const INVALID_MODEL_RESPONSE_CORRECTION =
  "Regenerate the complete JSON application from scratch. Fix: INVALID_MODEL_RESPONSE. Return only a complete app payload that follows the required schema and includes a working interactive control.";

const MAX_TRANSIENT_RETRIES = 1;
const MAX_CORRECTIVE_RETRIES = 2;

export async function generateApplication(
  input: GenerateRequest,
  config: AIConfig,
  fetcher: typeof fetch = fetch,
): Promise<GeneratedApp> {
  const messages = [
    { role: "system", content: APP_BUILDER_SYSTEM_PROMPT },
    ...(input.conversation ?? []).slice(-12),
    { role: "user", content: refinementContext(input) },
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 55_000);
  let correctiveMessage: string | null = null;
  let transientRetries = 0;
  let correctiveRetries = 0;

  try {
    while (true) {
      try {
        const requestMessages = correctiveMessage
          ? [...messages, { role: "user", content: correctiveMessage }]
          : messages;
        const response = await fetcher(providerUrl(config.baseUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            messages: requestMessages,
            temperature: 0.35,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && transientRetries < MAX_TRANSIENT_RETRIES) {
            transientRetries += 1;
            continue;
          }

          throw new AIClientError(
            "AI_UPSTREAM_ERROR",
            `AI provider returned ${response.status}.`,
          );
        }

        const payload = (await response.json()) as ProviderResponse;
        const content = payload.choices?.[0]?.message?.content;

        if (typeof content !== "string" || content.trim().length === 0) {
          throw new InvalidModelResponseError();
        }

        const app = parseGeneratedApp(content);
        const quality = validateGeneratedAppQuality(app);

        if (quality.violationCodes.length > 0) {
          if (correctiveRetries < MAX_CORRECTIVE_RETRIES) {
            correctiveRetries += 1;
            correctiveMessage = quality.correctiveMessage;
            continue;
          }

          throw new InvalidModelResponseError();
        }

        return app;
      } catch (error) {
        if (error instanceof InvalidModelResponseError) {
          if (correctiveRetries < MAX_CORRECTIVE_RETRIES) {
            correctiveRetries += 1;
            correctiveMessage = INVALID_MODEL_RESPONSE_CORRECTION;
            continue;
          }

          throw error;
        }

        if (error instanceof AIClientError) {
          throw error;
        }

        if (isAbortError(error)) {
          throw new AIClientError("AI_TIMEOUT", "The AI request timed out.");
        }

        if (transientRetries < MAX_TRANSIENT_RETRIES) {
          transientRetries += 1;
          continue;
        }

        throw new AIClientError(
          "NETWORK_ERROR",
          "Could not reach the AI provider.",
        );
      }
    }
  } finally {
    clearTimeout(timeout);
  }

}
