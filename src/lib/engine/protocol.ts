import type { CanonicalTable } from "../canonical/hash";

/**
 * The message protocol between the main thread and the engine worker. Both sides validate
 * what they receive: a message crossing the boundary is `unknown` until narrowed here.
 */

/** Where the engine is in its life, as the UI shows it. */
export type EngineStatus =
  | { readonly phase: "idle" }
  | {
      readonly phase: "downloading";
      readonly bytesLoaded: number;
      readonly bytesTotal: number;
    }
  | { readonly phase: "instantiating" }
  | { readonly phase: "ready"; readonly version: string }
  | { readonly phase: "error"; readonly message: string };

/**
 * A value as `query` returns it. BIGINT stays a bigint so it is exact; temporal, DECIMAL,
 * and BLOB values arrive as DuckDB's own text for them.
 */
export type QueryCell = string | number | bigint | boolean | null;

export interface QueryColumn {
  readonly name: string;
  /** The Arrow type DuckDB returned the column as, for display only. */
  readonly type: string;
}

export interface QueryResult {
  readonly columns: readonly QueryColumn[];
  readonly rows: readonly (readonly QueryCell[])[];
}

/** A request to the worker; the id pairs it with its result. */
export type EngineRequest =
  | { readonly id: number; readonly kind: "init" }
  | { readonly id: number; readonly kind: "query"; readonly sql: string }
  | { readonly id: number; readonly kind: "exec"; readonly sql: string }
  | {
      readonly id: number;
      readonly kind: "registerFile";
      readonly name: string;
      readonly bytes: Uint8Array;
    }
  | { readonly id: number; readonly kind: "canonicalRead"; readonly relation: string }
  | { readonly id: number; readonly kind: "reset" };

export type EngineRequestKind = EngineRequest["kind"];

/** What a request of kind `K` carries beyond its id and kind. */
export type EngineRequestBody<K extends EngineRequestKind> = Omit<
  Extract<EngineRequest, { readonly kind: K }>,
  "id" | "kind"
>;

/** What each request kind resolves to. */
export interface EngineResults {
  readonly init: { readonly version: string };
  readonly query: QueryResult;
  readonly exec: null;
  readonly registerFile: null;
  readonly canonicalRead: CanonicalTable;
  readonly reset: null;
}

export type EngineErrorCode =
  /** DuckDB rejected the SQL or the data. */
  | "sql"
  /** The engine failed to load, so it cannot answer. */
  | "unavailable"
  /** The message was not a request this protocol knows. */
  | "bad-request"
  /** The worker died with requests in flight. */
  | "crashed"
  /** The client was disposed with requests in flight. */
  | "terminated";

export interface EngineErrorBody {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export type EngineResponse =
  | { readonly type: "result"; readonly id: number; readonly ok: true; readonly value: unknown }
  | {
      readonly type: "result";
      readonly id: number;
      readonly ok: false;
      readonly error: EngineErrorBody;
    };

export type EngineMessage =
  { readonly type: "status"; readonly status: EngineStatus } | EngineResponse;

const ERROR_CODES: readonly EngineErrorCode[] = [
  "sql",
  "unavailable",
  "bad-request",
  "crashed",
  "terminated",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** The id of a message that looks like a request, even a malformed one, so it can be answered. */
export function requestIdOf(message: unknown): number | null {
  return isRecord(message) && isRequestId(message.id) ? message.id : null;
}

/** Narrows a message the worker received to a request, or null if it is not one. */
export function parseEngineRequest(message: unknown): EngineRequest | null {
  if (!isRecord(message) || !isRequestId(message.id)) return null;
  const { id, kind } = message;
  switch (kind) {
    case "init":
    case "reset":
      return { id, kind };
    case "query":
    case "exec":
      return typeof message.sql === "string" ? { id, kind, sql: message.sql } : null;
    case "registerFile":
      return typeof message.name === "string" && message.bytes instanceof Uint8Array
        ? { id, kind, name: message.name, bytes: message.bytes }
        : null;
    case "canonicalRead":
      return typeof message.relation === "string" ? { id, kind, relation: message.relation } : null;
    default:
      return null;
  }
}

function parseStatus(value: unknown): EngineStatus | null {
  if (!isRecord(value)) return null;
  switch (value.phase) {
    case "idle":
    case "instantiating":
      return { phase: value.phase };
    case "downloading": {
      const { bytesLoaded, bytesTotal } = value;
      return typeof bytesLoaded === "number" && typeof bytesTotal === "number"
        ? { phase: "downloading", bytesLoaded, bytesTotal }
        : null;
    }
    case "ready":
      return typeof value.version === "string" ? { phase: "ready", version: value.version } : null;
    case "error":
      return typeof value.message === "string" ? { phase: "error", message: value.message } : null;
    default:
      return null;
  }
}

function parseError(value: unknown): EngineErrorBody | null {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  const code = ERROR_CODES.find((c) => c === value.code);
  return code === undefined ? null : { code, message: value.message };
}

/** Narrows a message the main thread received to an engine message, or null if it is not one. */
export function parseEngineMessage(message: unknown): EngineMessage | null {
  if (!isRecord(message)) return null;
  if (message.type === "status") {
    const status = parseStatus(message.status);
    return status === null ? null : { type: "status", status };
  }
  if (message.type !== "result" || !isRequestId(message.id)) return null;
  if (message.ok === true)
    return { type: "result", id: message.id, ok: true, value: message.value };
  if (message.ok !== false) return null;
  const error = parseError(message.error);
  return error === null ? null : { type: "result", id: message.id, ok: false, error };
}
