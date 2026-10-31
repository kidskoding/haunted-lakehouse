"use client";

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  keywordCompletionSource,
  PostgreSQL,
  schemaCompletionSource,
  sql,
} from "@codemirror/lang-sql";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { schemaFromRelations, templateCompletionSource } from "./completions";
import { errorsToDiagnostics } from "./diagnostics";
import { editorHighlighting, editorTheme } from "./theme";
import type { EditorError, EditorRelation } from "./types";

export interface SqlViewProps {
  readonly path: string;
  readonly source: string;
  readonly relations: readonly EditorRelation[];
  readonly errors: readonly EditorError[];
  readonly onChange: (source: string) => void;
  readonly onPreview?: () => void;
  readonly onRunNight?: () => void;
  readonly onFormat?: () => void;
  readonly className?: string;
}

function languageExtensions(relations: readonly EditorRelation[]) {
  const schema = schemaFromRelations(relations);
  return [
    sql({ dialect: PostgreSQL, schema, upperCaseKeywords: false }),
    // `override` replaces language-provided sources, so schema, keywords, and templates
    // are listed together here.
    autocompletion({
      override: [
        schemaCompletionSource({ dialect: PostgreSQL, schema }),
        keywordCompletionSource(PostgreSQL, false),
        templateCompletionSource(relations),
      ],
    }),
  ];
}

/**
 * A CodeMirror 6 SQL host for one model file. Parent components own the source string; this
 * view syncs when `path` or an external rewrite (format, materialization) changes the text.
 */
export function SqlView({
  path,
  source,
  relations,
  errors,
  onChange,
  onPreview,
  onRunNight,
  onFormat,
  className,
}: SqlViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const suppressChange = useRef(false);
  const callbacks = useRef({ onChange, onPreview, onRunNight, onFormat });
  const lastPath = useRef(path);
  const lastRelationsKey = useRef("");

  useEffect(() => {
    callbacks.current = { onChange, onPreview, onRunNight, onFormat };
  }, [onChange, onPreview, onRunNight, onFormat]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          dropCursor(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          foldGutter(),
          lintGutter(),
          placeholder("select …"),
          language.current.of(languageExtensions(relations)),
          editorTheme,
          editorHighlighting,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !suppressChange.current) {
              callbacks.current.onChange(update.state.doc.toString());
            }
          }),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                callbacks.current.onPreview?.();
                return true;
              },
            },
            {
              key: "Mod-Shift-Enter",
              preventDefault: true,
              run: () => {
                callbacks.current.onRunNight?.();
                return true;
              },
            },
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                callbacks.current.onFormat?.();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.contentAttributes.of({
            "aria-label": `SQL for ${path}`,
          }),
        ],
      }),
    });
    viewRef.current = view;
    lastPath.current = path;
    lastRelationsKey.current = JSON.stringify(relations);
    view.dispatch(setDiagnostics(view.state, errorsToDiagnostics(source, errors)));

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; path/source/schema sync through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host lifetime
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const relationsKey = JSON.stringify(relations);
    if (relationsKey !== lastRelationsKey.current) {
      lastRelationsKey.current = relationsKey;
      view.dispatch({
        effects: language.current.reconfigure(languageExtensions(relations)),
      });
    }

    const current = view.state.doc.toString();
    lastPath.current = path;
    if (current !== source) {
      suppressChange.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
      suppressChange.current = false;
    }

    view.dispatch(setDiagnostics(view.state, errorsToDiagnostics(source, errors)));
  }, [path, source, relations, errors]);

  return <div ref={parentRef} data-editor-path={path} className={className} />;
}
