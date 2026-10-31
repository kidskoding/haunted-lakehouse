import { quoteIdentifier } from "../canonical/sql";
import { findCycle, topologicalOrder } from "./dag";
import { analyzeQuery, type QueryRef } from "./extract-refs";
import { lineColumn } from "./position";
import { renderWithMap, sourceIndex, type RenderedSql } from "./render";
import { parseTemplate, type Piece, type Template } from "./template";
import type {
  CompileError,
  CompileErrorCode,
  Materialization,
  ModelSchema,
  SqlParser,
} from "./types";

/** Runtime contract 10.2. */
export const MAX_MODELS = 64;
export const MAX_MODEL_BYTES = 64 * 1024;

/** A model file in the player's project, at `silver/<name>.sql` or `gold/<name>.sql`. */
export interface ModelFile {
  readonly path: string;
  readonly source: string;
}

export interface CompileOptions {
  readonly parser: SqlParser;
  /** Every feed of the town, the names `bronze.<feed>` and `new_batch` may use. */
  readonly knownFeeds: readonly string[];
  /** The feeds of the hour being played; models that need any other feed are inactive. */
  readonly hourFeeds: readonly string[];
  /** True for characters that cannot use `table` (The Purist). */
  readonly tableDisabled?: boolean;
}

export interface CompiledModel {
  /** `schema.name`, the relation the model defines. */
  readonly id: string;
  readonly schema: ModelSchema;
  readonly name: string;
  readonly path: string;
  readonly materialization: Materialization;
  /** Key columns as written, or null to append (and for non-incremental models). */
  readonly uniqueKey: readonly string[] | null;
  /** The model file as the player wrote it. */
  readonly source: string;
  /** Every relation the model reads, as sorted `schema.name` ids, `new_batch` feeds included. */
  readonly refs: readonly string[];
  /** Feeds read through `{{ new_batch('feed') }}`, sorted. */
  readonly feeds: readonly string[];
  /** Whether every feed the model depends on, directly or upstream, is a feed of the hour. */
  readonly active: boolean;
  readonly template: Template;
}

export interface CompiledPipeline {
  /** Every model, sorted by id. */
  readonly models: readonly CompiledModel[];
  /** Every model id in execution order (runtime contract 2.4); filter by `active` to run. */
  readonly order: readonly string[];
}

export type CompileResult =
  | { readonly ok: true; readonly pipeline: CompiledPipeline }
  | { readonly ok: false; readonly errors: readonly CompileError[] };

const PATH = /^(silver|gold)\/([a-z][a-z0-9_]{0,62})\.sql$/;

interface Located {
  readonly code: CompileErrorCode;
  readonly message: string;
  /** Index in the model file, or null when the error has no place in it. */
  readonly at: number | null;
}

interface ModelDraft {
  readonly file: ModelFile;
  readonly id: string;
  readonly schema: ModelSchema;
  readonly name: string;
}

interface Analyzed {
  readonly template: Template;
  readonly refs: ReadonlyMap<string, number | null>;
  readonly feeds: readonly string[];
}

function located(model: string | null, source: string, issue: Located): CompileError {
  const base = { code: issue.code, model, message: issue.message };
  return issue.at === null ? base : { ...base, ...lineColumn(source, issue.at) };
}

/**
 * A schema name for template placeholders that cannot clash with anything in the file, so
 * the relations `{{ this }}` and `{{ new_batch }}` render to are recognizable in the parse tree.
 */
function placeholderSchema(source: string): string {
  const folded = source.toLowerCase();
  let n = 0;
  while (folded.includes(`__hl_tag${String(n)}`)) n++;
  return `__hl_tag${String(n)}`;
}

function* newBatchPieces(pieces: readonly Piece[]): Generator<Piece & { kind: "new_batch" }> {
  for (const piece of pieces) {
    if (piece.kind === "new_batch") yield piece;
    if (piece.kind === "if") {
      yield* newBatchPieces(piece.then);
      yield* newBatchPieces(piece.otherwise);
    }
  }
}

function draftModels(files: readonly ModelFile[]): {
  drafts: ModelDraft[];
  errors: CompileError[];
} {
  const drafts: ModelDraft[] = [];
  const errors: CompileError[] = [];
  const seen = new Set<string>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const match = PATH.exec(file.path);
    const schema = match?.[1];
    const name = match?.[2];
    if ((schema !== "silver" && schema !== "gold") || name === undefined) {
      errors.push({
        code: "invalid_path",
        model: null,
        message:
          `\`${file.path}\` is not a model path. Models live at silver/<name>.sql or ` +
          `gold/<name>.sql, with a name of lowercase letters, digits, and underscores.`,
      });
      continue;
    }
    const id = `${schema}.${name}`;
    if (seen.has(id)) {
      errors.push({ code: "duplicate_model", model: id, message: `\`${id}\` is defined twice.` });
      continue;
    }
    seen.add(id);
    drafts.push({ file, id, schema, name });
  }
  return { drafts, errors };
}

class ModelCompiler {
  readonly errors: CompileError[] = [];
  private readonly knownFeeds: ReadonlySet<string>;

  constructor(
    private readonly options: CompileOptions,
    private readonly modelIds: ReadonlySet<string>,
  ) {
    this.knownFeeds = new Set(options.knownFeeds.map((feed) => feed.toLowerCase()));
  }

  async analyze(draft: ModelDraft): Promise<Analyzed | null> {
    const { source } = draft.file;
    const issues: Located[] = [];
    if (new TextEncoder().encode(source).length > MAX_MODEL_BYTES) {
      issues.push({
        code: "model_too_large",
        message: `A model file holds at most ${String(MAX_MODEL_BYTES / 1024)} KiB.`,
        at: null,
      });
      return this.finish(draft, issues, null);
    }
    const parsed = parseTemplate(source, { tableDisabled: this.options.tableDisabled ?? false });
    if (!parsed.ok) {
      issues.push(parsed.error);
      return this.finish(draft, issues, null);
    }
    const { template } = parsed;
    const refs = new Map<string, number | null>();
    const feeds = new Set<string>();
    for (const piece of newBatchPieces(template.pieces)) {
      if (!this.knownFeeds.has(piece.feed)) {
        issues.push({
          code: "unknown_feed",
          message: `There is no feed named '${piece.feed}'.`,
          at: piece.start,
        });
      }
      feeds.add(piece.feed);
      if (!refs.has(`bronze.${piece.feed}`)) refs.set(`bronze.${piece.feed}`, piece.start);
    }
    for (const issue of await this.parseVariants(template, source, refs)) issues.push(issue);
    return this.finish(draft, issues, {
      template,
      refs,
      feeds: [...feeds].sort(),
    });
  }

  private finish(draft: ModelDraft, issues: readonly Located[], analyzed: Analyzed | null) {
    const unique = new Map<string, CompileError>();
    const sorted = [...issues].sort(
      (a, b) => (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER),
    );
    for (const issue of sorted) {
      const error = located(draft.id, draft.file.source, issue);
      unique.set(JSON.stringify(error), error);
    }
    this.errors.push(...unique.values());
    return unique.size === 0 ? analyzed : null;
  }

  /**
   * Parses every rendering the model can take: an incremental model's first step and its
   * later steps can read different relations, and the DAG needs both.
   */
  private async parseVariants(
    template: Template,
    source: string,
    refs: Map<string, number | null>,
  ): Promise<Located[]> {
    const placeholder = placeholderSchema(source);
    const context = {
      thisRelation: `${quoteIdentifier(placeholder)}.this`,
      newBatchRelation: (feed: string) =>
        `${quoteIdentifier(placeholder)}.${quoteIdentifier(`new_batch_${feed}`)}`,
    };
    const variants = template.config.materialization === "incremental" ? [false, true] : [false];
    const rendered = new Map<string, RenderedSql>();
    for (const isIncremental of variants) {
      const variant = renderWithMap(template, { ...context, isIncremental });
      if (!rendered.has(variant.sql)) rendered.set(variant.sql, variant);
    }
    const issues: Located[] = [];
    for (const variant of rendered.values()) {
      const output = await this.options.parser(variant.sql);
      const analysis = analyzeQuery(variant.sql, output, new Set([placeholder]));
      const toSource = (at: number | null) => (at === null ? null : sourceIndex(variant, at));
      for (const issue of analysis.issues) issues.push({ ...issue, at: toSource(issue.at) });
      for (const ref of analysis.refs) {
        const issue = this.checkRef(ref, toSource(ref.at));
        if (issue) issues.push(issue);
        const id = `${ref.schema}.${ref.name}`;
        if (!refs.has(id)) refs.set(id, toSource(ref.at));
      }
    }
    return issues;
  }

  private checkRef(ref: QueryRef, at: number | null): Located | null {
    const id = `${ref.schema}.${ref.name}`;
    if (ref.schema === "bronze") {
      if (this.knownFeeds.has(ref.name)) return null;
      return { code: "unknown_relation", message: `\`${id}\` is not a feed.`, at };
    }
    if (this.modelIds.has(id)) return null;
    return {
      code: "unknown_relation",
      message: `\`${id}\` is not a model in your pipeline.`,
      at,
    };
  }
}

function cycleError(
  cycle: readonly string[],
  analyzed: ReadonlyMap<string, Analyzed>,
  sources: ReadonlyMap<string, string>,
): CompileError {
  const [first, second] = cycle;
  const start = first ?? "";
  const path = cycle.join(" → ");
  const message =
    cycle.length === 2
      ? `\`${start}\` reads itself: ${path}. Use {{ this }} to read your own state.`
      : `These models read each other in a cycle: ${path}.`;
  const at = analyzed.get(start)?.refs.get(second ?? "") ?? null;
  return located(start, sources.get(start) ?? "", { code: "cycle", message, at });
}

function activeModels(
  order: readonly string[],
  analyzed: ReadonlyMap<string, Analyzed>,
  hourFeeds: ReadonlySet<string>,
): ReadonlySet<string> {
  const active = new Set<string>();
  for (const id of order) {
    const refs = [...(analyzed.get(id)?.refs.keys() ?? [])];
    const ready = refs.every((ref) =>
      ref.startsWith("bronze.") ? hourFeeds.has(ref.slice("bronze.".length)) : active.has(ref),
    );
    if (ready) active.add(id);
  }
  return active;
}

/**
 * Compiles the player's project (runtime contract section 2): reads each model's config and
 * template tags, parses its SQL with DuckDB to find what it reads, checks every reference,
 * and orders the models into an acyclic graph. User errors come back as structured errors,
 * all of them at once, never as exceptions.
 */
export async function compile(
  files: readonly ModelFile[],
  options: CompileOptions,
): Promise<CompileResult> {
  if (files.length > MAX_MODELS) {
    return {
      ok: false,
      errors: [
        {
          code: "too_many_models",
          model: null,
          message: `A pipeline holds at most ${String(MAX_MODELS)} models; this one has ${String(files.length)}.`,
        },
      ],
    };
  }
  const { drafts, errors } = draftModels(files);
  const compiler = new ModelCompiler(options, new Set(drafts.map((draft) => draft.id)));
  const analyzed = new Map<string, Analyzed>();
  for (const draft of [...drafts].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const result = await compiler.analyze(draft);
    if (result) analyzed.set(draft.id, result);
  }
  errors.push(...compiler.errors);

  const graph = new Map([...analyzed].map(([id, model]) => [id, [...model.refs.keys()]]));
  const cycle = findCycle(graph);
  if (cycle) {
    const sources = new Map(drafts.map((draft) => [draft.id, draft.file.source]));
    errors.push(cycleError(cycle, analyzed, sources));
  }
  if (errors.length > 0) return { ok: false, errors };

  const order = topologicalOrder(graph);
  const hourFeeds = new Set(options.hourFeeds.map((feed) => feed.toLowerCase()));
  const active = activeModels(order, analyzed, hourFeeds);
  const models = drafts
    .map((draft): CompiledModel | null => {
      const model = analyzed.get(draft.id);
      if (!model) return null;
      return {
        id: draft.id,
        schema: draft.schema,
        name: draft.name,
        path: draft.file.path,
        materialization: model.template.config.materialization,
        uniqueKey: model.template.config.uniqueKey,
        source: draft.file.source,
        refs: [...model.refs.keys()].sort(),
        feeds: model.feeds,
        active: active.has(draft.id),
        template: model.template,
      };
    })
    .filter((model) => model !== null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return { ok: true, pipeline: { models, order } };
}
