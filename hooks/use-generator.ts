"use client";

import { useCallback, useMemo, useState } from "react";

import {
  GenerationRequestError,
  requestGeneration,
} from "@/lib/client-api";
import type { GeneratedBuild, GenerateRequest } from "@/types/ai";

export type GenerationPhase =
  | "idle"
  | "preparing"
  | "generating"
  | "validating"
  | "success"
  | "error";

export function useGenerator() {
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [error, setError] = useState<GenerationRequestError | null>(null);

  const isGenerating = useMemo(
    () => ["preparing", "generating", "validating"].includes(phase),
    [phase],
  );

  const generate = useCallback(
    async (input: GenerateRequest): Promise<GeneratedBuild | null> => {
      setError(null);
      setPhase("preparing");
      await Promise.resolve();
      setPhase("generating");

      try {
        const result = await requestGeneration(input, () => setPhase("validating"));
        await Promise.resolve();
        setPhase("success");
        return result;
      } catch (caught) {
        const normalized =
          caught instanceof GenerationRequestError
            ? caught
            : new GenerationRequestError(
                "NETWORK_ERROR",
                "Something went wrong. Please try again.",
              );
        setError(normalized);
        setPhase("error");
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  return { phase, error, isGenerating, generate, reset };
}
