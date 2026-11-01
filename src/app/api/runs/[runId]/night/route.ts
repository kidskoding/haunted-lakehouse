import { handleJudgeNight } from "@/server/batches/http";

type RouteContext = { params: Promise<{ runId: string }> };

/**
 * Judges a run-the-night attempt. Body: `{ attemptToken, events }`, where `events` is every
 * event the browser's Run the night yielded, in timeline order. Returns only the first miss.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleJudgeNight(runId, request);
}
