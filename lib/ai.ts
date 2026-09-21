import { APP_BUILDER_SYSTEM_PROMPT } from "@/prompts/app-builder";
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

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetcher(providerUrl(config.baseUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: 0.35,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt === 0) {
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

        return parseGeneratedApp(content);
      } catch (error) {
        if (error instanceof InvalidModelResponseError || error instanceof AIClientError) {
          throw error;
        }

        if (isAbortError(error)) {
          throw new AIClientError("AI_TIMEOUT", "The AI request timed out.");
        }

        if (attempt === 0) {
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

  throw new AIClientError("AI_UPSTREAM_ERROR", "AI generation failed.");
}
