"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PipelineDag } from "@/components/dag/pipeline-dag";
import { ModelEditor, type EditorError, type EditorFile } from "@/components/editor";
import { ResultsPanel, type ResultsView } from "@/components/results";
import { RunLayout } from "@/components/run";
import { BottomBar } from "@/components/run/bottom-bar";
import { CandleLost } from "@/components/run/candle-lost";
import { NightTimeline } from "@/components/run/night";
import { StoryPanel } from "@/components/run/story";
import { TableBrowser, useTableCatalog } from "@/components/run/tables";
import { TopBar } from "@/components/run/top-bar";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { relationName } from "@/lib/executor/connection";
import { engineConnection } from "@/lib/executor/engine-connection";
import { goldModels, runNight, runPreview } from "@/lib/executor/night";
import { reportError, reportFailure, type FailureReport } from "@/lib/executor/report";
import type { NightBatch, NightEvent } from "@/lib/executor/types";
import { useEngine } from "@/lib/engine/react";
import type { CompiledPipeline } from "@/lib/pipeline/compile";
import { serializeQuery } from "@/lib/pipeline/sql-parser";
import type { EngineStatus, RunActivity } from "@/lib/run/bottom-bar";
import { failureFromVerdict } from "@/lib/run/failure";
import type { NightVerdict } from "@/lib/run/night-timeline";
import type { RunHourView, RunView } from "@/lib/run/view";
import * as api from "./api";
import { NewModel } from "./new-model";
import { editorErrors, modelOfPath, pathOfModel } from "./project";
import { compileFiles, useCompiled } from "./use-compiled";

const EMPTY_PIPELINE: CompiledPipeline = { models: [], order: [] };
const RESULT_LIMIT = 1000;
const NOT_COMPILED = "The pipeline has an error. The editor marks where.";

export interface HourScreenProps {
  readonly view: RunView;
  readonly hour: RunHourView;
  readonly files: readonly EditorFile[];
  readonly onFilesChange: (update: (files: readonly EditorFile[]) => readonly EditorFile[]) => void;
  /** Reloads the run after a judged night; resolves once the new view is in. */
  readonly onReload: () => Promise<void>;
}

interface Night {
  readonly events: readonly NightEvent[];
  readonly verdict: NightVerdict;
  readonly pipeline: CompiledPipeline;
}

interface Loss {
  readonly failure: FailureReport;
  readonly alreadyVisible: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One open hour, played in the browser: bronze loads into the page's engine, the project
 * compiles as it is typed, Preview runs the visible batches, and Run the night replays the
 * whole hour for the server to judge.
 */
export function HourScreen({ view, hour, files, onFilesChange, onReload }: HourScreenProps) {
  const { client, status } = useEngine();
  const { show } = useToast();
  const ready = status.phase === "ready";
  const connection = useMemo(() => engineConnection(client), [client]);
  const [activePath, setActivePath] = useState(files[0]?.path ?? "");
  const [activity, setActivity] = useState<RunActivity>("idle");
  const [results, setResults] = useState<ResultsView>({
    status: "idle",
    hint: "Preview runs your pipeline over the batches that have landed; gold shows here.",
  });
  const [runtimeErrors, setRuntimeErrors] = useState<readonly EditorError[]>([]);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [night, setNight] = useState<Night | null>(null);
  const [loss, setLoss] = useState<Loss | null>(null);
  const batches = useRef<readonly NightBatch[]>([]);
  // Every execution starts from a reset database, so two must never interleave.
  const engineQueue = useRef<Promise<unknown>>(Promise.resolve());
  const exclusive = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = engineQueue.current.then(task, task);
    engineQueue.current = next.catch(() => undefined);
    return next;
  }, []);
  const [delivered, setDelivered] = useState(0);
  const busy = useRef(false);

  const rules = useMemo(
    () => ({
      knownFeeds: view.knownFeeds,
      hourFeeds: hour.feeds,
      tableDisabled: !view.tableMaterialization,
    }),
    [view.knownFeeds, hour.feeds, view.tableMaterialization],
  );
  // Parsing goes through the queue too: a reset mid-parse would fail the compile.
  const parse = useCallback(
    (sql: string) => exclusive(() => client.query(sql)),
    [exclusive, client],
  );
  const compiled = useCompiled(parse, ready, files, rules);
  const compileErrors =
    compiled.status === "done" && !compiled.result.ok ? compiled.result.errors : [];
  const graph = compiled.status === "done" ? (compiled.lastGood ?? EMPTY_PIPELINE) : EMPTY_PIPELINE;

  const compileError =
    compiled.status === "failed"
      ? "The parser"
      : compiled.status === "pending"
        ? null
        : (compileErrors[0]?.model ?? (compileErrors.length > 0 ? "The project" : null));

  // The parser needs DuckDB's json extension, which autoloads only while external access is
  // on. Each execution turns that off in its database, so load it as each one opens.
  const freshDatabase = useCallback(async () => {
    await client.reset();
    await client.query(serializeQuery("SELECT 1"));
  }, [client]);

  // Primitives, so a reloaded view with the same hour doesn't make a new execute and reload bronze.
  const { replayBatch, retention } = hour;
  const previewReplay =
    replayBatch !== null && hour.visible.includes(replayBatch) ? replayBatch : null;
  const goldKey = hour.goldTables.join(",");

  const execute = useCallback(
    (project: CompiledPipeline): Promise<void> =>
      exclusive(async () => {
        await freshDatabase();
        const result = await runPreview(connection, {
          pipeline: project,
          batches: batches.current,
          retention,
          replayBatch: previewReplay,
        });
        setCatalogVersion((n) => n + 1);
        if (result.error) {
          const reported = reportError(result.error, project, batches.current[0]?.index ?? 0);
          setRuntimeErrors(
            reported.path === null
              ? []
              : [
                  {
                    path: reported.path,
                    message: reported.message,
                    ...(reported.line === undefined ? {} : { line: reported.line }),
                    ...(reported.column === undefined ? {} : { column: reported.column }),
                  },
                ],
          );
          setResults({
            status: "error",
            message: `${reported.model} failed on batch ${String(reported.batch + 1)}.`,
            details: reported.message,
          });
          return;
        }
        setRuntimeErrors([]);
        const gold = project.models.find(
          (model) =>
            model.active && model.schema === "gold" && goldKey.split(",").includes(model.id),
        );
        if (!gold) {
          setResults({
            status: "idle",
            hint: "Bronze is loaded. Build a gold model to see it here.",
          });
          return;
        }
        const rows = await client.query(
          `SELECT * FROM ${relationName(gold.schema, gold.name)} LIMIT ${String(RESULT_LIMIT)}`,
        );
        setResults({ status: "ready", result: rows, limit: RESULT_LIMIT, label: gold.id });
      }),
    [client, connection, exclusive, freshDatabase, previewReplay, retention, goldKey],
  );

  // Bronze for the batches the player may see, before any model runs. Again after a failed
  // night reveals one more, which also clears the hidden batches that night loaded.
  const visibleKey = hour.visible.join(",");
  useEffect(() => {
    if (!ready || night !== null) return;
    let live = true;
    // Read through a call, so each await sees the cleanup's write rather than a narrowed copy.
    const isLive = () => live;
    void (async () => {
      // Preview and the night wait until this hour's bronze is in.
      setLoaded(false);
      try {
        const visible = await api.previewBatches(view.runId);
        if (!isLive()) return;
        batches.current = visible;
        setDelivered(visible.length);
        await execute(EMPTY_PIPELINE);
        if (isLive()) setLoaded(true);
      } catch (error: unknown) {
        if (isLive()) {
          setResults({ status: "error", message: "Bronze didn't load.", details: message(error) });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [ready, night, view.runId, visibleKey, execute]);

  // The pipeline as the files stand now: the editor's compile can trail the last keystroke.
  const currentPipeline = useCallback(async (): Promise<CompiledPipeline | null> => {
    const result =
      compiled.status === "done" && compiled.files === files
        ? compiled.result
        : await compileFiles(parse, files, rules);
    return result.ok ? result.pipeline : null;
  }, [compiled, files, parse, rules]);

  const preview = useCallback(() => {
    if (!loaded || busy.current) return;
    busy.current = true;
    setActivity("previewing");
    setResults({ status: "loading", label: "Previewing the visible batches" });
    currentPipeline()
      .then((pipeline) => {
        if (pipeline) return execute(pipeline);
        setResults({ status: "error", message: NOT_COMPILED });
        return undefined;
      })
      .catch((error: unknown) => {
        setResults({
          status: "error",
          message: "The preview didn't finish.",
          details: message(error),
        });
      })
      .finally(() => {
        busy.current = false;
        setActivity("idle");
      });
  }, [loaded, currentPipeline, execute]);

  const runTheNight = useCallback(() => {
    if (!loaded || busy.current) return;
    busy.current = true;
    setActivity("running");
    void (async () => {
      try {
        const pipeline = await currentPipeline();
        if (!pipeline) {
          setResults({ status: "error", message: NOT_COMPILED });
          return;
        }
        // Refused here at no cost: opening an attempt serves the hidden night, which costs a
        // candle if it's never judged.
        const { missingGold } = goldModels(pipeline, hour.goldTables);
        if (missingGold.length > 0) {
          setResults({
            status: "error",
            message: `The night needs a model for ${missingGold.join(", ")}.`,
          });
          return;
        }
        const token = await api.startNightAttempt(view.runId);
        const all = await Promise.all(
          hour.schedule.batches.map((batch) => api.nightBatch(view.runId, batch.index, token)),
        );
        const played = await exclusive(async () => {
          await freshDatabase();
          return runNight(connection, {
            pipeline,
            batches: all,
            checkpoints: hour.checkpoints,
            retention: hour.retention,
            goldTables: hour.goldTables,
            replayBatch: hour.replayBatch,
          });
        });
        if (!played.started) {
          // Refused before it began, at no cost; reload the visible bronze it cleared.
          await execute(EMPTY_PIPELINE);
          setResults({
            status: "error",
            message: `The night needs a model for ${played.missingGold.join(", ")}.`,
          });
          return;
        }
        const verdict = await api.judgeNight(view.runId, token, played.events);
        setNight({ events: played.events, verdict, pipeline });
      } catch (error: unknown) {
        show({ tone: "error", title: "The night didn't run", description: message(error) });
        await execute(EMPTY_PIPELINE).catch(() => undefined);
        // A 409 means the run moved on without this screen, as when an abandoned attempt
        // took the last candle, so read it again.
        if (error instanceof api.RunApiError && error.status === 409) await onReload();
      } finally {
        busy.current = false;
        setActivity("idle");
      }
    })();
  }, [
    loaded,
    currentPipeline,
    view.runId,
    hour,
    connection,
    exclusive,
    freshDatabase,
    execute,
    show,
    onReload,
  ]);

  const finishNight = useCallback(() => {
    if (!night) return;
    const { verdict, events } = night;
    if (!verdict.survived) {
      const failure = failureFromVerdict(verdict, events, hour.schedule, hour.goldTables);
      setLoss({
        failure: reportFailure(failure, night.pipeline),
        alreadyVisible: hour.visible.includes(verdict.revealedBatch),
      });
    }
    void onReload().finally(() => {
      setNight(null);
    });
  }, [night, hour, onReload]);

  // The browser reads the catalog in turn too, so a reset never lands mid-read.
  const catalogConnection = useMemo(
    () => ({
      run: (sql: string) => exclusive(() => connection.run(sql)),
      query: (sql: string) => exclusive(() => connection.query(sql)),
    }),
    [connection, exclusive],
  );
  const tables = useTableCatalog(loaded ? catalogConnection : null, catalogVersion);
  const relations =
    tables.status === "ready"
      ? tables.relations.map((relation) => ({
          id: relation.id,
          columns: relation.columns.map((column) => column.name),
        }))
      : [];

  if (night) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-page flex-col justify-center px-8 py-12">
        <NightTimeline
          schedule={hour.schedule}
          events={night.events}
          verdict={night.verdict}
          onContinue={finishNight}
        />
      </main>
    );
  }

  const engine: EngineStatus =
    status.phase === "error" ? "failed" : ready && loaded ? "ready" : "warming";
  const errors = [...editorErrors(compileErrors), ...runtimeErrors];

  return (
    <>
      <RunLayout
        title={hour.title}
        topBar={<TopBar view={view.topBar} />}
        story={
          <StoryPanel title={hour.title} lines={hour.story.lines} asides={hour.story.asides} />
        }
        tables={
          <Panel className="h-full">
            <PanelHeader>
              <PanelTitle>Tables</PanelTitle>
            </PanelHeader>
            <div className="min-h-0 flex-1 overflow-auto">
              <TableBrowser view={tables} retention={{ keeps: hour.retention, delivered }} />
            </div>
          </Panel>
        }
        dag={
          <PipelineDag
            models={graph.models}
            errors={compileErrors}
            feeds={hour.feeds}
            openModelId={modelOfPath(activePath)}
            onOpenModel={(id) => {
              setActivePath(pathOfModel(id));
            }}
          />
        }
        editor={
          <div className="flex h-full min-h-0 flex-col">
            <ModelEditor
              files={files}
              activePath={activePath}
              onActivePathChange={setActivePath}
              onChange={(path, source) => {
                onFilesChange((prev) =>
                  prev.map((file) => (file.path === path ? { ...file, source } : file)),
                );
              }}
              relations={relations}
              errors={errors}
              tableDisabled={!view.tableMaterialization}
              onPreview={preview}
              className="flex-1"
            />
            <NewModel
              taken={files.map((file) => file.path)}
              onCreate={(path) => {
                onFilesChange((prev) => [
                  ...prev,
                  { path, source: "{{ config(materialized='view') }}\nselect 1 as placeholder\n" },
                ]);
                setActivePath(path);
              }}
            />
          </div>
        }
        results={<ResultsPanel view={results} />}
        bottomBar={
          <BottomBar
            relics={view.relics}
            hour={hour.relicHour}
            run={{
              engine,
              activity,
              compileError,
              boss: hour.boss,
              candles: view.topBar.candles.lit,
            }}
            onUseRelic={() => {
              // shortcut: relic use has no route yet; wire it to `relic_used` once one exists.
              show({
                tone: "info",
                title: "The relic stays quiet",
                description: "Relics can't be used yet.",
              });
            }}
            onPreview={preview}
            onRunNight={runTheNight}
          />
        }
      />
      {loss && hour.lastLoss ? (
        <CandleLost
          candles={{
            lit: view.topBar.candles.lit,
            lost: hour.lastLoss.cost,
            total: view.topBar.candles.total,
          }}
          failure={loss.failure}
          alreadyVisible={loss.alreadyVisible}
          reaction={hour.lastLoss.reaction}
          onDismiss={() => {
            setLoss(null);
          }}
        />
      ) : null}
    </>
  );
}
