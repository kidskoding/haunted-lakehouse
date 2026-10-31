import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * CodeMirror chrome and syntax colours, drawn only from `--color-syn-*` and the night surface
 * tokens so the editor matches the rest of the run screen.
 */
export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "var(--text-code)",
      lineHeight: "var(--text-code--line-height)",
      fontFamily: "var(--font-mono)",
      backgroundColor: "var(--color-inset)",
      color: "var(--color-syn-identifier)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "var(--text-code--line-height)",
      overflow: "auto",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-content": {
      caretColor: "var(--color-flame)",
      padding: "12px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-flame)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--color-selection)",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-inset)",
      color: "var(--color-faint)",
      border: "none",
      borderRight: "1px solid var(--color-line-faint)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 16px",
      minWidth: "2.5rem",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--color-ash)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--color-raised)",
      color: "var(--color-parchment)",
      border: "1px solid var(--color-line-control)",
      borderRadius: "var(--radius-xs)",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul": {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-code-s, var(--text-code))",
      },
      "& > ul > li": {
        padding: "4px 10px",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: "var(--color-tint-flame)",
        color: "var(--color-parchment)",
      },
    },
    ".cm-diagnostic-error": {
      borderBottom: "1px solid var(--color-syn-error)",
    },
    ".cm-lintPoint-error": {
      borderBottomColor: "var(--color-syn-error)",
    },
    ".cm-panels": {
      backgroundColor: "var(--color-panel)",
      color: "var(--color-ash)",
    },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-syn-keyword)" },
  { tag: tags.operator, color: "var(--color-syn-operator)" },
  { tag: tags.number, color: "var(--color-syn-number)" },
  { tag: tags.string, color: "var(--color-syn-string)" },
  { tag: tags.comment, color: "var(--color-syn-comment)", fontStyle: "italic" },
  { tag: tags.name, color: "var(--color-syn-identifier)" },
  { tag: tags.variableName, color: "var(--color-syn-identifier)" },
  { tag: tags.typeName, color: "var(--color-syn-table)" },
  { tag: tags.propertyName, color: "var(--color-syn-identifier)" },
  { tag: tags.function(tags.variableName), color: "var(--color-syn-function)" },
  { tag: tags.special(tags.variableName), color: "var(--color-syn-table)" },
  { tag: tags.bool, color: "var(--color-syn-keyword)" },
  { tag: tags.null, color: "var(--color-syn-keyword)" },
  { tag: tags.punctuation, color: "var(--color-syn-operator)" },
  { tag: tags.meta, color: "var(--color-syn-comment)" },
  { tag: tags.invalid, color: "var(--color-syn-error)" },
]);

export const editorHighlighting = syntaxHighlighting(highlightStyle);
