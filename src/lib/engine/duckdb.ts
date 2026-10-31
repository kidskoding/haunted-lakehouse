import {
  AsyncDuckDB,
  selectBundle,
  VoidLogger,
  type AsyncDuckDBConnection,
  type DuckDBBundles,
  type InstantiationProgress,
} from "@duckdb/duckdb-wasm";
import type { Database, LoadDatabase } from "./host";
import { MODULE_BYTES } from "./module-bytes";
import type { EngineStatus } from "./protocol";

/**
 * The bundler emits each file as a hashed static asset of our own app, so the engine never
 * depends on a CDN and every deploy serves the exact files its code expects. Only the
 * single-threaded builds are listed: threads need cross-origin isolation, which the site
 * does not enable.
 */
const BUNDLES = {
  mvp: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm", import.meta.url).href,
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js", import.meta.url)
      .href,
  },
  eh: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", import.meta.url).href,
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js", import.meta.url)
      .href,
  },
} satisfies DuckDBBundles;

/** Progress is posted when it moves by at least this fraction, to keep the main thread quiet. */
const PROGRESS_STEP = 0.01;

/** Turns DuckDB's download progress into status, ending in `instantiating` exactly once. */
function progressReporter(onStatus: (status: EngineStatus) => void, bytesTotal: number) {
  let lastPosted = 0;
  let downloaded = false;
  const instantiating = (): void => {
    if (downloaded) return;
    downloaded = true;
    onStatus({ phase: "instantiating" });
  };
  const onProgress = ({ bytesLoaded }: InstantiationProgress): void => {
    if (downloaded) return;
    if (bytesLoaded >= bytesTotal) {
      instantiating();
    } else if (bytesLoaded - lastPosted >= bytesTotal * PROGRESS_STEP) {
      lastPosted = bytesLoaded;
      onStatus({ phase: "downloading", bytesLoaded, bytesTotal });
    }
  };
  return { onProgress, instantiating };
}

/** Loads DuckDB-WASM in its own nested worker and opens an empty in-memory database. */
export const loadDuckDB: LoadDatabase = async (onStatus) => {
  const bundle = await selectBundle(BUNDLES);
  if (bundle.mainWorker === null) throw new Error("No DuckDB worker suits this browser.");
  const bytesTotal =
    bundle.mainModule === BUNDLES.eh.mainModule ? MODULE_BYTES.eh : MODULE_BYTES.mvp;
  onStatus({ phase: "downloading", bytesLoaded: 0, bytesTotal });
  const progress = progressReporter(onStatus, bytesTotal);
  const db = new AsyncDuckDB(new VoidLogger(), new Worker(bundle.mainWorker));
  await db.instantiate(bundle.mainModule, null, progress.onProgress);
  progress.instantiating();
  await db.open({});
  const version = await db.getVersion();
  let connection: AsyncDuckDBConnection = await db.connect();

  const database: Database = {
    version,
    query: (sql) => connection.query(sql),
    registerFile: (name, bytes) => db.registerFileBuffer(name, bytes),
    reset: async () => {
      await connection.close();
      await db.dropFiles();
      await db.reset();
      await db.open({});
      connection = await db.connect();
    },
  };
  return database;
};
