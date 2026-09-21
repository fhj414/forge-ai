import { composePreviewDocument } from "@/lib/preview";
import type { Project } from "@/types/project";

const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;
const TRAILING_FILENAME_CHARACTERS = /[. ]+$/g;

function projectFilename(title: string): string {
  const sanitizedTitle = title
    .replace(INVALID_FILENAME_CHARACTERS, "")
    .replace(TRAILING_FILENAME_CHARACTERS, "");

  return `${sanitizedTitle || "forge-app"}.html`;
}

export function createProjectExport(project: Project): {
  filename: string;
  content: string;
} {
  return {
    filename: projectFilename(project.title),
    content: composePreviewDocument(project),
  };
}

export function downloadProjectHtml(project: Project): void {
  const { filename, content } = createProjectExport(project);
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);

    try {
      link.click();
    } finally {
      link.remove();
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
