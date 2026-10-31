import { handleCreateRun } from "@/server/runs/http";

/** Starts a run. Body: `{ character, seed? }`. Answers with the run screen's view. */
export async function POST(request: Request): Promise<Response> {
  return handleCreateRun(request);
}
