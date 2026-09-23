import { afterEach, describe, expect, it, vi } from "vitest";

import { maxDuration, POST } from "@/app/api/generate/route";

const envSnapshot = {
  AI_API_KEY: process.env.AI_API_KEY,
  AI_API_BASE: process.env.AI_API_BASE,
  AI_MODEL: process.env.AI_MODEL,
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/generate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env.AI_API_KEY = envSnapshot.AI_API_KEY;
    process.env.AI_API_BASE = envSnapshot.AI_API_BASE;
    process.env.AI_MODEL = envSnapshot.AI_MODEL;
  });

  it("allows the shared AI deadline to finish on Vercel", () => {
    expect(maxDuration).toBe(60);
  });

  it("returns a specific error when the AI service is not configured", async () => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;

    const response = await POST(makeRequest({ prompt: "Build a task manager" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AI_NOT_CONFIGURED",
        message: "AI service is not configured.",
      },
    });
  });

  it("rejects an empty prompt before contacting the provider", async () => {
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "forge-test";
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(makeRequest({ prompt: "" }));

    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("defaults to the OpenRouter API when no base URL is configured", async () => {
    process.env.AI_API_KEY = "test-key";
    delete process.env.AI_API_BASE;
    process.env.AI_MODEL = "forge-test";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Task Orbit",
                  summary: "A focused task manager.",
                  html: "<main>Tasks</main>",
                  css: "body{}",
                  javascript: "",
                  changes: ["Task list"],
                  suggestions: ["Add keyboard shortcuts"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(makeRequest({ prompt: "Build a task manager" }));

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.any(Object),
    );
  });

  it("returns a validated build with real metadata for an initial generation", async () => {
    process.env.AI_API_KEY = "test-key";
    process.env.AI_API_BASE = "https://llm.example/v1";
    process.env.AI_MODEL = "forge-test";
    vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(345);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `\`\`\`json\n${JSON.stringify({
                    title: "Task Orbit",
                    summary: "A focused task manager.",
                    html: "<main>\né</main>",
                    css: "body{}",
                    javascript: "console.log('ok')",
                    changes: ["Task list"],
                    suggestions: ["Add keyboard shortcuts"],
                  })}\n\`\`\``,
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await POST(makeRequest({ prompt: "Build a task manager" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: "Task Orbit",
      summary: "A focused task manager.",
      html: "<main>\né</main>",
      css: "body{}",
      javascript: "console.log('ok')",
      changes: ["Task list"],
      suggestions: ["Add keyboard shortcuts"],
      generationMetadata: {
        model: "forge-test",
        durationMs: 245,
        kind: "initial",
        codeLines: 4,
        codeBytes: 39,
        schemaValidated: true,
      },
    });
  });

  it("marks requests with current source as refinements", async () => {
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "forge-test";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Task Orbit",
                    summary: "A refined task manager.",
                    html: "<main>Tasks</main>",
                    css: "body{}",
                    javascript: "",
                    changes: ["Task filters"],
                    suggestions: [],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await POST(
      makeRequest({
        prompt: "Add filters",
        currentCode: { html: "<main>Tasks</main>", css: "body{}", javascript: "" },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      generationMetadata: { kind: "refinement" },
    });
  });

  it("maps quality-correction exhaustion to invalid model output", async () => {
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "forge-test";
    const inertResponse = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Inert Task Orbit",
                  summary: "A task manager with a save action.",
                  html: "<main><button>Save</button></main>",
                  css: "body{}",
                  javascript: "",
                  changes: ["Save action"],
                  suggestions: ["Add keyboard shortcuts"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(inertResponse())
      .mockResolvedValueOnce(inertResponse());
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(makeRequest({ prompt: "Build a task manager" }));

    expect(response.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_MODEL_RESPONSE",
        message: "The AI returned an invalid application. Please retry.",
      },
    });
  });
});
