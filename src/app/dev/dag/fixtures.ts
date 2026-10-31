import type { CompileError } from "@/lib/pipeline/types";
import type { DagModel } from "@/components/dag/layout";

/**
 * Fixture projects shaped like `compile()` output. The DAG reads these fields only; the editor
 * (5.3.6) will pass the live `CompiledModel` / `CompileError` values from the compiler.
 */
export interface DagScenario {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly feeds: readonly string[];
  readonly models: readonly DagModel[];
  readonly errors: readonly CompileError[];
}

export const scenarios: readonly DagScenario[] = [
  {
    id: "empty",
    title: "Empty hour",
    blurb: "Feeds of the hour with no models yet. Placeholders mark silver and gold.",
    feeds: ["porch_events"],
    models: [],
    errors: [],
  },
  {
    id: "porch",
    title: "Porch lights",
    blurb: "A healthy bronze → silver → gold chain. Gold nodes read as checked.",
    feeds: ["porch_events"],
    models: [
      {
        id: "silver.latest",
        materialization: "incremental",
        refs: ["bronze.porch_events"],
        active: true,
      },
      {
        id: "gold.lit_at_checkpoint",
        materialization: "view",
        refs: ["silver.latest"],
        active: true,
      },
    ],
    errors: [],
  },
  {
    id: "branching",
    title: "Branching",
    blurb: "Two silvers feed one gold; an unused hour feed sits quiet in bronze.",
    feeds: ["porch_events", "door_scans"],
    models: [
      {
        id: "silver.latest",
        materialization: "incremental",
        refs: ["bronze.porch_events"],
        active: true,
      },
      {
        id: "silver.counts",
        materialization: "table",
        refs: ["bronze.porch_events"],
        active: true,
      },
      {
        id: "gold.dashboard",
        materialization: "view",
        refs: ["silver.latest", "silver.counts"],
        active: true,
      },
    ],
    errors: [],
  },
  {
    id: "inactive",
    title: "Inactive model",
    blurb: "A model that needs a feed this hour does not have stays inactive.",
    feeds: ["porch_events"],
    models: [
      {
        id: "silver.latest",
        materialization: "incremental",
        refs: ["bronze.porch_events"],
        active: true,
      },
      {
        id: "silver.votes",
        materialization: "table",
        refs: ["bronze.costume_votes"],
        active: false,
      },
      {
        id: "gold.lit_at_checkpoint",
        materialization: "view",
        refs: ["silver.latest"],
        active: true,
      },
    ],
    errors: [],
  },
  {
    id: "cycle",
    title: "Cycle",
    blurb: "Two silvers read each other. The loop edge arcs back over the top.",
    feeds: ["porch_events"],
    models: [
      {
        id: "silver.a",
        materialization: "view",
        refs: ["silver.b", "bronze.porch_events"],
        active: true,
      },
      {
        id: "silver.b",
        materialization: "view",
        refs: ["silver.a"],
        active: true,
      },
    ],
    errors: [
      {
        code: "cycle",
        model: null,
        message: "Models form a cycle: silver.a → silver.b → silver.a.",
      },
    ],
  },
  {
    id: "errors",
    title: "Compile errors",
    blurb: "Broken models light snuffed; their first error shows in the strip.",
    feeds: ["porch_events"],
    models: [
      {
        id: "silver.latest",
        materialization: "incremental",
        refs: ["bronze.porch_events"],
        active: true,
      },
      {
        id: "gold.lit_at_checkpoint",
        materialization: null,
        refs: [],
        active: false,
      },
    ],
    errors: [
      {
        code: "syntax_error",
        model: "gold.lit_at_checkpoint",
        message: "Parser error near SELECT: unexpected end of input.",
        line: 3,
        column: 1,
      },
    ],
  },
  {
    id: "no-gold",
    title: "No gold yet",
    blurb: "Silver alone is not enough to clear an hour. The gold placeholder waits.",
    feeds: ["porch_events"],
    models: [
      {
        id: "silver.latest",
        materialization: "incremental",
        refs: ["bronze.porch_events"],
        active: true,
      },
    ],
    errors: [],
  },
];
