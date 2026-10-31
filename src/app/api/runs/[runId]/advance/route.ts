import { handleAdvanceRun } from "@/server/runs/http";

type RouteContext = { params: Promise<{ runId: string }> };

/** Moves the run on after a clear: draws the relic offer, or opens the next hour. */
export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleAdvanceRun(runId);
}
