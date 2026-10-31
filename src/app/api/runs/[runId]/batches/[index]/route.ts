import { handleGetBatch } from "@/server/batches/http";

type RouteContext = { params: Promise<{ runId: string; index: string }> };

/**
 * Serves one batch. Hidden batches need an `Authorization: Bearer <attemptToken>` header
 * from POST `/api/runs/:runId/night-attempt`.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { runId, index: raw } = await context.params;
  const index = Number(raw);
  const header = request.headers.get("authorization");
  const attemptToken = header?.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : null;
  return handleGetBatch(runId, index, attemptToken === "" ? null : attemptToken);
}
