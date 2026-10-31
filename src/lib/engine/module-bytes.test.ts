import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { MODULE_BYTES } from "./module-bytes";

const require = createRequire(import.meta.url);

describe("MODULE_BYTES", () => {
  it.each(Object.entries(MODULE_BYTES))("matches the installed %s module", (bundle, bytes) => {
    const file = require.resolve(`@duckdb/duckdb-wasm/dist/duckdb-${bundle}.wasm`);
    expect(statSync(file).size).toBe(bytes);
  });
});
