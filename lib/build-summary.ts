import type { AppCode, GenerationMetadata } from "@/types/ai";

export interface BuildSummary {
  components: number;
  interactions: number;
  responsive: boolean;
  persisted: boolean;
  generationMetadata?: GenerationMetadata;
}

function countTags(source: string, tags: string[]) {
  const matches = source.match(new RegExp(`<(?:${tags.join("|")})\\b`, "gi"));
  return matches?.length ?? 0;
}

export function analyzeBuild(
  code: AppCode & { generationMetadata?: GenerationMetadata },
  persisted: boolean,
): BuildSummary {
  const components = countTags(code.html, [
    "header",
    "nav",
    "main",
    "section",
    "aside",
    "article",
    "footer",
    "form",
  ]);
  const interactions = countTags(code.html, [
    "button",
    "input",
    "select",
    "textarea",
    "form",
  ]);

  return {
    components: Math.max(components, 1),
    interactions,
    responsive: /@media\s*\(/i.test(code.css),
    persisted,
    generationMetadata: code.generationMetadata,
  };
}
