import { afterEach, describe, expect, it, vi } from "vitest";

import { generateApplication } from "@/lib/ai";
import { InvalidModelResponseError } from "@/lib/schemas";
import type { GenerateRequest } from "@/types/ai";

const request: GenerateRequest = {
  prompt: "Make the theme dark and add a chart.",
  currentCode: {
    html: "<main>Ledger</main>",
    css: "main { color: black; }",
    javascript: "console.log('ledger')",
  },
  conversation: [{ role: "user", content: "Build an expense tracker." }],
};

const config = {
  apiKey: "test-key",
  baseUrl: "https://llm.example/v1/",
  model: "forge-test",
  timeoutMs: 250,
};

const validContent = JSON.stringify({
  title: "Dark Ledger",
  summary: "A dark expense dashboard with a monthly chart.",
  html: "<main>Dark ledger</main>",
  css: "body { background: #09090b; }",
  javascript: "console.log('dark')",
  changes: ["Dark theme", "Monthly chart"],
  suggestions: ["Add CSV export"],
});

function completion(content = validContent, status = 200) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("generateApplication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the prompt and current code to the configured provider", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion());

    const result = await generateApplication(request, config, fetcher);

    expect(result.title).toBe("Dark Ledger");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("forge-test");
    expect(body.messages.at(-1)?.content).toContain("<main>Ledger</main>");
    expect(body.messages.at(-1)?.content).toContain(request.prompt);
  });

  it("retries one transient upstream failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(completion());

    await expect(generateApplication(request, config, fetcher)).resolves.toMatchObject({
      title: "Dark Ledger",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("maps repeated aborts to a timeout error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Request aborted", "AbortError"));

    await expect(generateApplication(request, config, fetcher)).rejects.toMatchObject({
      code: "AI_TIMEOUT",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed model output", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion("not valid json"));

    await expect(generateApplication(request, config, fetcher)).rejects.toBeInstanceOf(
      InvalidModelResponseError,
    );
  });
});
