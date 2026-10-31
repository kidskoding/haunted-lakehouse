import { ensurePlayerId } from "@/server/session/session";

/**
 * Starts or resumes an anonymous session. POST rather than GET because it can set a cookie,
 * and GETs must stay safe to prefetch.
 */
export async function POST(): Promise<Response> {
  const { playerId, created } = await ensurePlayerId();
  return Response.json({ playerId }, { status: created ? 201 : 200 });
}
