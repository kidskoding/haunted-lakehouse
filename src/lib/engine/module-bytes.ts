/**
 * The decoded size of each DuckDB module in the pinned package, so download progress has a
 * true total. DuckDB counts decoded bytes, but a compressed response's Content-Length counts
 * encoded ones, so the header cannot give it. A unit test keeps these in step with the
 * installed files.
 */
export const MODULE_BYTES = { mvp: 39_362_651, eh: 34_242_586 } as const;
