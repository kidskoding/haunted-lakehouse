"use client";

import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { EngineClient } from "./client";
import { getEngine } from "./engine";
import type { EngineStatus } from "./protocol";
import { EngineSelfTest } from "./self-test";

const EngineContext = createContext<EngineClient | null>(null);

const IDLE: EngineStatus = { phase: "idle" };

/** Runs `task` once the browser is idle, so the first paint and hydration go first. */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: 1000 });
    return () => {
      window.cancelIdleCallback(handle);
    };
  }
  const handle = window.setTimeout(task, 0);
  return () => {
    window.clearTimeout(handle);
  };
}

/**
 * Starts loading the engine in the background as soon as the page is idle, so it is ready
 * by the time the player has read the intro. The load runs in a worker and never blocks input.
 */
export function EngineProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [client] = useState(getEngine);
  useEffect(
    () =>
      whenIdle(() => {
        client.start();
      }),
    [client],
  );

  return (
    <EngineContext value={client}>
      {children}
      <EngineStatusMarker client={client} />
      {process.env.NODE_ENV === "production" ? null : <EngineSelfTest client={client} />}
    </EngineContext>
  );
}

function useStatus(client: EngineClient): EngineStatus {
  return useSyncExternalStore(
    (onChange) => client.subscribe(onChange),
    () => client.status,
    () => IDLE,
  );
}

/** Exposes the engine's phase to tests and tooling without showing anything. */
function EngineStatusMarker({ client }: Readonly<{ client: EngineClient }>) {
  return <span hidden data-engine-status={useStatus(client).phase} />;
}

/** The page's engine and its live status. Must be used inside `EngineProvider`. */
export function useEngine(): { readonly client: EngineClient; readonly status: EngineStatus } {
  const client = use(EngineContext);
  if (client === null) throw new Error("useEngine must be used inside EngineProvider.");
  return { client, status: useStatus(client) };
}
