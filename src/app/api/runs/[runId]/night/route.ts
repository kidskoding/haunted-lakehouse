import { handleJudgeNight } from "@/server/batches/http";

type RouteContext = { params: Promise<{ runId: string }> };

/**
 * Judges a run-the-night attempt. Body: `{ attemptToken, checkpoints }` where `checkpoints`
 * maps checkpoint id → gold table → canonical SHA-256 hex. Returns only the first miss.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleJudgeNight(runId, request);
}
