"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { EditorFile } from "@/components/editor";
import { DeathScreen } from "@/components/run/death";
import { HourCleared } from "@/components/run/hour-cleared";
import { buttonClassName } from "@/components/ui/button-styles";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import type { RelicKind } from "@/lib/run/bottom-bar";
import type { RunView } from "@/lib/run/view";
import * as api from "./api";
import { HourScreen } from "./hour-screen";
import { withGoldStarters } from "./project";

export interface RunScreenProps {
  /** The run to resume; null starts a new one from `character` and `seed`. */
  readonly runId: string | null;
  readonly character: string | null;
  readonly seed: string | null;
  /** Starts today's Daily Haunt; the server picks its seed. */
  readonly daily?: boolean;
}

const filesKey = (runId: string) => `hl:run:${runId}:files`;

/** The project saved for this run in this browser, if storage allows it. */
function savedFiles(runId: string): EditorFile[] {
  try {
    const raw = window.localStorage.getItem(filesKey(runId));
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (file): file is EditorFile =>
        typeof file === "object" &&
        file !== null &&
        typeof (file as Record<string, unknown>).path === "string" &&
        typeof (file as Record<string, unknown>).source === "string",
    );
  } catch {
    return [];
  }
}

function saveFiles(runId: string, files: readonly EditorFile[]): void {
  try {
    window.localStorage.setItem(
      filesKey(runId),
      JSON.stringify(files.map(({ path, source }) => ({ path, source }))),
    );
  } catch {
    // Storage is a convenience: the project still lives in memory for this visit.
  }
}

const REFUSALS: Readonly<Record<string, string>> = {
  "locked-character": "That keeper hasn't been unlocked yet.",
  "invalid-character": "Nobody by that name works the lakehouse.",
  "invalid-seed": "That seed isn't one Hollow Creek knows.",
  "daily-taken": "You've had tonight's haunt. One attempt a day; a new seed posts at midnight UTC.",
  "not-found": "This night isn't yours, or it never happened.",
};

function refusal(error: unknown): string {
  if (error instanceof api.RunApiError) return REFUSALS[error.code] ?? error.message;
  return "The lakehouse didn't answer. Check the connection and try again.";
}

function Notice({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col justify-center gap-5 px-4 md:px-8">
      <h1 className="text-balance text-parchment type-display-m">{title}</h1>
      {children}
    </main>
  );
}

/**
 * The run route: starts or resumes a run, then shows whatever the night is waiting on. The
 * open hour, the clear and its relic choice, or the stone. The pipeline the player builds
 * persists across hours.
 */
export function RunScreen({ runId: initialRunId, character, seed, daily = false }: RunScreenProps) {
  const [view, setView] = useState<RunView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly EditorFile[]>([]);
  const [ended, setEnded] = useState(false);
  const started = useRef(false);

  const take = useCallback((next: RunView) => {
    setView(next);
    setFailed(null);
  }, []);

  useEffect(() => {
    // Development runs effects twice; a second POST would start a second run.
    if (started.current) return;
    started.current = true;
    const opening = initialRunId
      ? api.getRun(initialRunId)
      : api.createRun(character ?? "intern", seed, daily).then((created) => {
          // A reload resumes this run instead of starting another.
          window.history.replaceState(null, "", `/run?run=${created.runId}`);
          return created;
        });
    opening.then(
      (opened) => {
        setFiles(savedFiles(opened.runId));
        take(opened);
      },
      (error: unknown) => {
        setFailed(refusal(error));
      },
    );
  }, [initialRunId, character, seed, daily, take]);

  const runId = view?.runId ?? null;
  const hour = view?.hour ?? null;

  // Every gold table the hour reads has a file to start from, saved once the player edits it.
  const project = hour ? withGoldStarters(files, hour.goldTables, hour.feeds[0]) : files;
  const changeProject = useCallback(
    (update: (files: readonly EditorFile[]) => readonly EditorFile[]) => {
      setFiles(() => update(project));
    },
    [project],
  );

  useEffect(() => {
    if (runId !== null) saveFiles(runId, files);
  }, [runId, files]);

  const move = useCallback(
    (request: Promise<RunView>) => {
      request.then(take, (error: unknown) => {
        setFailed(refusal(error));
      });
    },
    [take],
  );

  // The game owes these on its own: a relic offer after a clear, or an hour that didn't open.
  const owed =
    view !== null &&
    view.status === "playing" &&
    (view.phase === "offering" || (view.phase === "opening" && view.cleared === null));
  useEffect(() => {
    if (owed && runId !== null) move(api.advanceRun(runId));
  }, [owed, runId, move]);

  const reload = useCallback(async () => {
    if (runId === null) return;
    try {
      take(await api.getRun(runId));
    } catch (error: unknown) {
      setFailed(refusal(error));
    }
  }, [runId, take]);

  const finishClear = useCallback(
    (relic: RelicKind | null) => {
      if (!view || runId === null) return;
      if (view.phase === "choosing") move(api.answerOffer(runId, relic));
      else if (view.phase === "opening") move(api.advanceRun(runId));
      else setEnded(true);
    },
    [view, runId, move],
  );

  let screen: ReactNode;
  if (failed !== null) {
    screen = (
      <Notice title="The night won't start.">
        <p className="max-w-copy text-ash type-prose">{failed}</p>
        <Link href="/run/new" className={`${buttonClassName("ghost", "md")} self-start`}>
          Choose again
        </Link>
      </Notice>
    );
  } else if (view === null || owed) {
    screen = (
      <Notice title="Lighting the lamps…">
        <p role="status" className="max-w-copy text-ash type-prose">
          The lakehouse is waking up for the night.
        </p>
      </Notice>
    );
  } else if (view.death) {
    screen = (
      <div className="relative h-dvh overflow-hidden">
        <DeathScreen stone={view.death.stone} sharePath={view.death.sharePath} />
      </div>
    );
  } else if (view.cleared && !ended) {
    screen = (
      <main className="min-h-dvh">
        <HourCleared key={view.cleared.title} {...view.cleared} onFinish={finishClear} />
      </main>
    );
  } else if (hour) {
    screen = (
      <HourScreen
        key={hour.slot}
        view={view}
        hour={hour}
        files={project}
        onFilesChange={changeProject}
        onReload={reload}
      />
    );
  } else {
    screen = (
      <Notice title="The night is over.">
        <p className="max-w-copy text-ash type-prose">
          Hollow Creek has what it needed from you tonight. The Crypt keeps what you learned.
        </p>
        <div className="flex gap-3">
          <Link href="/crypt" className={buttonClassName("primary", "md")}>
            To the Crypt
          </Link>
          <Link href="/run/new" className={buttonClassName("ghost", "md")}>
            Another night
          </Link>
        </div>
      </Notice>
    );
  }

  return (
    <ToastProvider>
      {screen}
      <ToastViewport />
    </ToastProvider>
  );
}
