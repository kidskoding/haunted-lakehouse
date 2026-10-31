"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "./cx";
import { AlertIcon } from "./icons";
import { nextRovingIndex } from "./roving";

interface TabsContextValue {
  readonly value: string;
  readonly select: (value: string) => void;
  readonly idFor: (part: "tab" | "panel", value: string) => string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`${component} must be used inside Tabs.`);
  return context;
}

type ValueProps =
  | { readonly value: string; readonly onValueChange: (value: string) => void }
  | { readonly defaultValue: string; readonly onValueChange?: (value: string) => void };

export type TabsProps = ValueProps & {
  readonly className?: string;
  readonly children: ReactNode;
};

/**
 * Tabs with a selected value (WAI-ARIA APG tabs pattern, automatic activation): arrow keys
 * move between tabs and select as they go, Home and End jump to the ends, and Tab leaves the
 * list for the selected panel. Only the selected tab is in the tab order. Controlled with
 * `value`, or uncontrolled with `defaultValue`.
 */
export function Tabs(props: TabsProps) {
  const baseId = useId();
  const [ownValue, setOwnValue] = useState("defaultValue" in props ? props.defaultValue : "");
  const value = "value" in props ? props.value : ownValue;

  const select = (next: string) => {
    if ("defaultValue" in props) setOwnValue(next);
    props.onValueChange?.(next);
  };
  // IDs are references, which whitespace would split.
  const idFor = (part: "tab" | "panel", tab: string) =>
    `${baseId}-${part}-${tab.replace(/\s/g, "_")}`;

  return (
    <TabsContext value={{ value, select, idFor }}>
      <div className={props.className}>{props.children}</div>
    </TabsContext>
  );
}

export interface TabListProps extends ComponentPropsWithoutRef<"div"> {
  /** Names the set of tabs, unless `aria-labelledby` points at a visible heading. */
  readonly "aria-label"?: string;
}

export function TabList({ className, onKeyDown, ...props }: TabListProps) {
  const { select } = useTabs("TabList");

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    if (current === -1) return;
    const next = nextRovingIndex(
      current,
      tabs.map((tab) => tab.getAttribute("aria-disabled") === "true"),
      event.key,
    );
    const target = next === undefined ? undefined : tabs[next];
    if (!target) return;
    event.preventDefault();
    target.focus();
    const value = target.dataset.value;
    if (value !== undefined) select(value);
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cx("flex items-end gap-px border-b border-line-faint", className)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export interface TabProps extends Omit<ComponentPropsWithoutRef<"button">, "value" | "disabled"> {
  readonly value: string;
  /** Unavailable: shown, announced as disabled, skipped by the arrow keys, never selected. */
  readonly disabled?: boolean;
}

export function Tab({ value, disabled = false, className, onClick, ...props }: TabProps) {
  const { value: selected, select, idFor } = useTabs("Tab");
  const isSelected = value === selected;

  return (
    <button
      type="button"
      role="tab"
      id={idFor("tab", value)}
      aria-controls={idFor("panel", value)}
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      tabIndex={isSelected ? 0 : -1}
      data-value={value}
      className={cx(
        "-mb-px inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-t-xs border-b-2",
        "border-transparent px-3 whitespace-nowrap text-ash type-ui",
        "transition-[background-color,color,border-color] duration-fast ease-out",
        "aria-selected:border-flame aria-selected:bg-raised aria-selected:text-parchment",
        "ui-hover:text-parchment ui-hover:not-aria-selected:border-line-strong",
        "ui-active:bg-fog aria-disabled:cursor-not-allowed aria-disabled:text-smoke",
        // Focus is drawn inside the tab so neighbours and the list's rule never clip it.
        "focus-visible:-outline-offset-2",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!disabled && !event.defaultPrevented) select(value);
      }}
      {...props}
    />
  );
}

export interface TabMarkerProps {
  /** `unsaved` is a quiet dot; `error` is the alert glyph, so the two differ by shape too. */
  readonly tone: "unsaved" | "error";
  /** Read by screen readers after the tab's name: "unsaved changes", "has an error". */
  readonly label: string;
}

/** A status mark at the end of a tab's label. */
export function TabMarker({ tone, label }: TabMarkerProps) {
  return (
    <>
      {tone === "error" ? (
        <AlertIcon className="size-3.5 shrink-0 text-snuffed" />
      ) : (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-tallow" />
      )}
      <span className="sr-only">, {label}</span>
    </>
  );
}

export interface TabPanelProps extends ComponentPropsWithoutRef<"div"> {
  readonly value: string;
}

/** The content for one tab. Hidden panels stay mounted, so their state survives a switch. */
export function TabPanel({ value, className, ...props }: TabPanelProps) {
  const { value: selected, idFor } = useTabs("TabPanel");
  return (
    <div
      role="tabpanel"
      id={idFor("panel", value)}
      aria-labelledby={idFor("tab", value)}
      hidden={value !== selected}
      tabIndex={0}
      className={cx("rounded-xs focus-visible:-outline-offset-2", className)}
      {...props}
    />
  );
}
