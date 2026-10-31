"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { MODEL_NAME } from "./project";

export interface NewModelProps {
  /** Paths already in the project. */
  readonly taken: readonly string[];
  readonly onCreate: (path: string) => void;
}

/** Adds a model file to the project: `silver/porch_state` becomes `silver/porch_state.sql`. */
export function NewModel({ taken, onCreate }: NewModelProps) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line-faint bg-panel px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!MODEL_NAME.test(trimmed)) {
          setProblem("Name it silver/<name> or gold/<name>, in lowercase letters, digits, and _.");
          return;
        }
        const path = `${trimmed}.sql`;
        if (taken.includes(path)) {
          setProblem(`${trimmed} is already in the project.`);
          return;
        }
        setProblem(null);
        setName("");
        onCreate(path);
      }}
    >
      <label htmlFor={inputId} className="text-ash type-ui">
        New model
      </label>
      <input
        id={inputId}
        value={name}
        placeholder="silver/porch_state"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? undefined : errorId}
        onChange={(event) => {
          setName(event.target.value);
        }}
        className="h-8 min-w-48 flex-1 rounded-xs border border-line-control bg-inset px-2 text-parchment type-data placeholder:text-smoke focus-visible:outline-2 focus-visible:outline-glow"
      />
      <Button type="submit" variant="ghost" size="sm">
        Add
      </Button>
      {problem === null ? null : (
        <p id={errorId} role="alert" className="w-full text-tallow type-ui">
          {problem}
        </p>
      )}
    </form>
  );
}
