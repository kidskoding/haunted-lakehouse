import type { NightBatch, NightEvent } from "@/lib/executor/types";
import type { RelicKind } from "@/lib/run/bottom-bar";
import type { NightVerdict } from "@/lib/run/night-timeline";
import type { RunView } from "@/lib/run/view";

/** A request the server refused, carrying its error code ("locked-character"). */
export class RunApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`The lakehouse answered ${String(status)}: ${code}.`);
    this.name = "RunApiError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code =
      body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "unknown";
    throw new RunApiError(response.status, code);
  }
  return body as T;
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function createRun(character: string, seed: string | null, daily = false): Promise<RunView> {
  return call("/api/runs", post({ character, seed, daily }));
}

export function getRun(runId: string): Promise<RunView> {
  return call(`/api/runs/${runId}`);
}

export function advanceRun(runId: string): Promise<RunView> {
  return call(`/api/runs/${runId}/advance`, post());
}

export function answerOffer(runId: string, relic: RelicKind | null): Promise<RunView> {
  return call(`/api/runs/${runId}/relic`, post({ relic }));
}

export async function previewBatches(runId: string): Promise<readonly NightBatch[]> {
  const { batches } = await call<{ batches: NightBatch[] }>(`/api/runs/${runId}/batches`);
  return batches;
}

export async function startNightAttempt(runId: string): Promise<string> {
  const { attemptToken } = await call<{ attemptToken: string }>(
    `/api/runs/${runId}/night-attempt`,
    post(),
  );
  return attemptToken;
}

export async function nightBatch(
  runId: string,
  index: number,
  attemptToken: string,
): Promise<NightBatch> {
  const { batch } = await call<{ batch: NightBatch }>(
    `/api/runs/${runId}/batches/${String(index)}`,
    { headers: { authorization: `Bearer ${attemptToken}` } },
  );
  return batch;
}

export function judgeNight(
  runId: string,
  attemptToken: string,
  events: readonly NightEvent[],
): Promise<NightVerdict> {
  return call(`/api/runs/${runId}/night`, post({ attemptToken, events }));
}
