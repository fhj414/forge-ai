import { ZodError } from "zod";

import { AIClientError, generateApplication } from "@/lib/ai";
import { errorResponse } from "@/lib/api-response";
import {
  InvalidModelResponseError,
  parseGenerateRequest,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();

  if (!apiKey || !model) {
    return errorResponse(
      "AI_NOT_CONFIGURED",
      "AI service is not configured.",
      503,
    );
  }

  try {
    const body: unknown = await request.json();
    const input = parseGenerateRequest(body);
    const result = await generateApplication(input, {
      apiKey,
      model,
      baseUrl: process.env.AI_API_BASE?.trim() || "https://api.openai.com/v1",
    });

    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse(
        "INVALID_REQUEST",
        "Please provide a non-empty prompt.",
        400,
      );
    }

    if (error instanceof InvalidModelResponseError) {
      return errorResponse(
        "INVALID_MODEL_RESPONSE",
        "The AI returned an invalid application. Please retry.",
        502,
      );
    }

    if (error instanceof AIClientError) {
      const status = error.code === "AI_TIMEOUT" ? 504 : 502;
      return errorResponse(error.code, error.message, status);
    }

    return errorResponse(
      "AI_UPSTREAM_ERROR",
      "Generation failed unexpectedly. Please retry.",
      500,
    );
  }
}
