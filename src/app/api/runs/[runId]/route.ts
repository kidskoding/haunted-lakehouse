import { handleGetRun } from "@/server/runs/http";

type RouteContext = { params: Promise<{ runId: string }> };

/** The run screen's view of one of the caller's runs. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleGetRun(runId);
}
