import { describe, expect, it, vi } from "vitest";

import { GenerationRequestError, requestGeneration } from "@/lib/client-api";

const request = { prompt: "Build a task manager" };

const validBuild = {
  title: "Task Orbit",
  summary: "A focused task manager.",
  html: "<main>Tasks</main>",
  css: "body{}",
  javascript: "",
  changes: ["Task list"],
  suggestions: ["Add keyboard shortcuts"],
  generationMetadata: {
    model: "forge-test",
    durationMs: 842,
    kind: "initial",
    codeLines: 2,
    codeBytes: 24,
    schemaValidated: true,
  },
};

function successResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("requestGeneration", () => {
  it("returns validated server-authored metadata with the generated app", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(successResponse(validBuild));

    await expect(requestGeneration(request, undefined, fetcher)).resolves.toEqual(
      validBuild,
    );
  });

  it("rejects successful responses that do not include trusted metadata", async () => {
    const appWithoutMetadata = structuredClone(validBuild);
    Reflect.deleteProperty(appWithoutMetadata, "generationMetadata");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successResponse(appWithoutMetadata));

    await expect(requestGeneration(request, undefined, fetcher)).rejects.toEqual(
      new GenerationRequestError(
        "INVALID_MODEL_RESPONSE",
        "The AI returned an invalid application. Please retry.",
      ),
    );
  });
});
