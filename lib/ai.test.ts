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

const inertInteractiveContent = JSON.stringify({
  title: "Inert Ledger",
  summary: "A ledger with a save action.",
  html: "<main><button>Save</button></main>",
  css: "body { background: #09090b; }",
  javascript: "",
  changes: ["Save action"],
  suggestions: ["Add categories"],
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
    expect(body.messages[0]?.content).toContain(
      "Keep the implementation complete but concise",
    );
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
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(
      fetcher.mock.calls[1]?.[1]?.signal,
    );
  });

  it("does not retry a timed-out request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Request aborted", "AbortError"));

    await expect(generateApplication(request, config, fetcher)).rejects.toMatchObject({
      code: "AI_TIMEOUT",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps a transient retry inside one total deadline", async () => {
    vi.useFakeTimers();
    let retrySignal: AbortSignal | null = null;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(new Response("busy", { status: 503 })), 100);
          }),
      )
      .mockImplementationOnce(
        (_url, init) => {
          retrySignal = init?.signal ?? null;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Request aborted", "AbortError")),
              { once: true },
            );
          });
        },
      );

    try {
      const result = generateApplication(request, config, fetcher);
      const rejection = expect(result).rejects.toMatchObject({
        code: "AI_TIMEOUT",
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(fetcher).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(config.timeoutMs - 101);
      expect(retrySignal).not.toBeNull();
      expect((retrySignal as AbortSignal | null)?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((retrySignal as AbortSignal | null)?.aborted).toBe(true);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries malformed model output once before rejecting it", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion("not valid json"))
      .mockResolvedValueOnce(completion("not valid json"));

    await expect(generateApplication(request, config, fetcher)).rejects.toBeInstanceOf(
      InvalidModelResponseError,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("corrects a quality-gate rejection in one bounded second attempt", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion(inertInteractiveContent))
      .mockResolvedValueOnce(completion());

    await expect(generateApplication(request, config, fetcher)).resolves.toMatchObject({
      title: "Dark Ledger",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      model: string;
    };
    const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    const correction = secondBody.messages.at(-1)?.content ?? "";

    expect(firstBody.model).toBe("forge-test");
    expect(secondBody.model).toBe("forge-test");
    expect(correction).toContain("ACTIONABLE_HTML_REQUIRES_JAVASCRIPT");
    expect(correction).not.toContain("<button>Save</button>");
    expect(correction.length).toBeLessThanOrEqual(500);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(
      fetcher.mock.calls[1]?.[1]?.signal,
    );
  });

  it("rejects after the corrective attempt also fails quality validation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion(inertInteractiveContent))
      .mockResolvedValueOnce(completion(inertInteractiveContent));

    await expect(generateApplication(request, config, fetcher)).rejects.toBeInstanceOf(
      InvalidModelResponseError,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
