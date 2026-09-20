import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/generate/route";

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
    process.env.AI_API_KEY = envSnapshot.AI_API_KEY;
    process.env.AI_API_BASE = envSnapshot.AI_API_BASE;
    process.env.AI_MODEL = envSnapshot.AI_MODEL;
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

  it("returns the validated application payload", async () => {
    process.env.AI_API_KEY = "test-key";
    process.env.AI_API_BASE = "https://llm.example/v1";
    process.env.AI_MODEL = "forge-test";
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
                    html: "<main>Tasks</main>",
                    css: "body{}",
                    javascript: "",
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
    await expect(response.json()).resolves.toMatchObject({
      title: "Task Orbit",
      suggestions: ["Add keyboard shortcuts"],
    });
  });
});
