import { z } from "zod";

import type { GeneratedApp, GenerateRequest } from "@/types/ai";

const HTML_MAX_LENGTH = 200_000;
const CSS_MAX_LENGTH = 120_000;
const JAVASCRIPT_MAX_LENGTH = 120_000;

const generatedAppSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  html: z.string().min(1).max(HTML_MAX_LENGTH),
  css: z.string().max(CSS_MAX_LENGTH),
  javascript: z.string().max(JAVASCRIPT_MAX_LENGTH),
  changes: z.array(z.string().trim().min(1)).default([]),
  suggestions: z.array(z.string().trim().min(1)).max(4).default([]),
});

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  currentCode: z
    .object({
      html: z.string().max(HTML_MAX_LENGTH),
      css: z.string().max(CSS_MAX_LENGTH),
      javascript: z.string().max(JAVASCRIPT_MAX_LENGTH),
    })
    .optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8_000),
      }),
    )
    .max(30)
    .optional(),
});

export class InvalidModelResponseError extends Error {
  constructor(message = "Invalid model response: expected a complete app payload.") {
    super(message);
    this.name = "InvalidModelResponseError";
  }
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new InvalidModelResponseError();
  }

  return candidate.slice(start, end + 1);
}

export function parseGeneratedApp(raw: string): GeneratedApp {
  try {
    const parsed: unknown = JSON.parse(extractJson(raw));
    const result = generatedAppSchema.safeParse(parsed);

    if (!result.success) {
      throw new InvalidModelResponseError();
    }

    return result.data;
  } catch (error) {
    if (error instanceof InvalidModelResponseError) {
      throw error;
    }

    throw new InvalidModelResponseError();
  }
}

export function parseGenerateRequest(input: unknown): GenerateRequest {
  return generateRequestSchema.parse(input);
}
