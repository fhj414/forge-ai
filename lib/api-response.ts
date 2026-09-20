import type {
  GenerateErrorCode,
  GenerateErrorPayload,
} from "@/types/ai";

export function errorResponse(
  code: GenerateErrorCode,
  message: string,
  status: number,
) {
  const payload: GenerateErrorPayload = { error: { code, message } };
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
