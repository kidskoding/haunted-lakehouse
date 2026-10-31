import { handleAnswerOffer } from "@/server/runs/http";

type RouteContext = { params: Promise<{ runId: string }> };

/** Answers the relic offer. Body: `{ relic }`, null to take none. Then opens the next hour. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleAnswerOffer(runId, request);
}
