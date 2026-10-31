import { handleListBatches } from "@/server/batches/http";

type RouteContext = { params: Promise<{ runId: string }> };

/** Lists the visible (preview) batches for the caller's open hour. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  return handleListBatches(runId);
}
