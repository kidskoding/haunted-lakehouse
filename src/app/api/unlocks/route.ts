import { handleGetUnlocks, handleGrantFragment } from "@/server/unlocks/http";

/** The caller's persisted unlocks: acts, characters, endings, and ledger fragments. */
export async function GET(): Promise<Response> {
  return handleGetUnlocks();
}

/** Record a ledger page found in a run. Body: `{ fragmentId, runId? }`. */
export async function POST(request: Request): Promise<Response> {
  return handleGrantFragment(request);
}
