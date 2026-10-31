import { handleStartNightAttempt } from "@/server/batches/http";

type RouteContext = { params: Promise<{ runId: string }> };

/**
 * Opens a short-lived run-the-night attempt. The returned token unlocks hidden batches for
 * this run's open hour until it expires.
 */
export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleStartNightAttempt(runId);
}
