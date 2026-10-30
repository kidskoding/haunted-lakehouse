// The duration cap is probed from outside: a request with ?sleep=N holds the
// function for N seconds, and the first N that gets cut off marks the limit.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_SLEEP_SECONDS = 900;

export async function GET(request: Request): Promise<Response> {
  const sleepParam = new URL(request.url).searchParams.get("sleep");
  const sleepSeconds = Math.min(Number(sleepParam ?? 0) || 0, MAX_SLEEP_SECONDS);
  const startedAt = Date.now();
  if (sleepSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
  }

  return Response.json({
    node: process.version,
    region: process.env.VERCEL_REGION ?? null,
    memoryLimitMb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null,
    heapLimitMb: Math.round(
      (await import("node:v8")).getHeapStatistics().heap_size_limit / 1024 / 1024,
    ),
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    sleptMs: Date.now() - startedAt,
  });
}
