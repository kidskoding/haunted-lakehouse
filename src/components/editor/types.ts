/** One model file open in the editor, at `silver/<name>.sql` or `gold/<name>.sql`. */
export interface EditorFile {
  readonly path: string;
  readonly source: string;
  /** True while the file has changes the player has not saved. */
  readonly unsaved?: boolean;
}

/** A relation the player can read, such as `bronze.porch_events`, and its columns. */
export interface EditorRelation {
  readonly id: string;
  readonly columns: readonly string[];
}

/**
 * An error to show in a model file: a compile error or a runtime error mapped back to the file.
 * `line` and `column` are 1-based; without them the error has no place in the file.
 */
export interface EditorError {
  readonly path: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}
