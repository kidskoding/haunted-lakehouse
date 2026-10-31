import type { Piece, Template } from "./template";

/** What the executor substitutes for a model's template tags in one step. */
export interface RenderContext {
  /** False on the model's first step, when it has no state yet (runtime contract 5.3). */
  readonly isIncremental: boolean;
  /** The relation holding the model's state, for `{{ this }}`. */
  readonly thisRelation: string;
  /** The relation holding feed `feed`'s rows of the current batch, for `{{ new_batch }}`. */
  readonly newBatchRelation: (feed: string) => string;
}

/**
 * A run of rendered SQL and where it came from in the model file. Verbatim chunks are copied
 * text; the others are tag substitutions, which map back to the start of their tag.
 */
interface Chunk {
  readonly renderedStart: number;
  readonly sourceStart: number;
  readonly length: number;
  readonly verbatim: boolean;
}

export interface RenderedSql {
  readonly sql: string;
  readonly chunks: readonly Chunk[];
}

/** Renders a template and keeps the map from rendered positions back to the model file. */
export function renderWithMap(template: Template, context: RenderContext): RenderedSql {
  let sql = "";
  const chunks: Chunk[] = [];
  const emit = (text: string, sourceStart: number, verbatim: boolean): void => {
    chunks.push({ renderedStart: sql.length, sourceStart, length: text.length, verbatim });
    sql += text;
  };
  const visit = (pieces: readonly Piece[]): void => {
    for (const piece of pieces) {
      switch (piece.kind) {
        case "text":
          emit(piece.text, piece.start, true);
          break;
        case "this":
          emit(context.thisRelation, piece.start, false);
          break;
        case "new_batch":
          emit(context.newBatchRelation(piece.feed), piece.start, false);
          break;
        case "if":
          visit(context.isIncremental ? piece.then : piece.otherwise);
          break;
      }
    }
  };
  visit(template.pieces);
  return { sql, chunks };
}

/**
 * Renders a compiled model's SQL for one step (runtime contract 2.3): `{{ config }}` becomes
 * nothing, `{{ this }}` and `{{ new_batch('f') }}` become the given relations, and an
 * `{% if is_incremental() %}` block keeps the branch for the model's state.
 */
export function render(model: { readonly template: Template }, context: RenderContext): string {
  return renderWithMap(model.template, context).sql;
}

/** The index in the model file that produced position `index` of the rendered SQL. */
export function sourceIndex(rendered: RenderedSql, index: number): number {
  let found: Chunk | undefined;
  for (const chunk of rendered.chunks) {
    if (chunk.renderedStart > index) break;
    found = chunk;
  }
  if (!found) return 0;
  if (!found.verbatim) return found.sourceStart;
  return found.sourceStart + Math.min(index - found.renderedStart, found.length);
}
