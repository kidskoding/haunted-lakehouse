"use client";

import { useState, type ReactNode } from "react";
import { Button, IconButton, type ButtonVariant } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { Shortcut, usePlatform } from "@/components/ui/kbd";
import { ariaKeyShortcuts } from "@/components/ui/shortcut";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Section, Specimen } from "./section";

const states = [
  { name: "Rest", props: {} },
  { name: "Hover", props: { "data-preview-state": "hover" } },
  { name: "Focus", props: { "data-preview-state": "focus" } },
  { name: "Pressed", props: { "data-preview-state": "hover active" } },
  { name: "Disabled", props: { disabled: true } },
  { name: "Loading", props: { loading: true } },
] as const;

interface Row {
  readonly variant: ButtonVariant;
  readonly render: (props: (typeof states)[number]["props"]) => ReactNode;
}

const runKeys = ["Mod", "Shift", "Enter"] as const;
const previewKeys = ["Mod", "Enter"] as const;

const rows: readonly Row[] = [
  {
    variant: "primary",
    render: (props) => (
      <Button variant="primary" size="lg" {...props}>
        Run the night
        <Shortcut keys={runKeys} aria-hidden />
      </Button>
    ),
  },
  {
    variant: "secondary",
    render: (props) => (
      <Button variant="secondary" size="lg" {...props}>
        Preview
        <Shortcut keys={previewKeys} aria-hidden />
      </Button>
    ),
  },
  {
    variant: "ghost",
    render: (props) => (
      <Button variant="ghost" {...props}>
        Format
      </Button>
    ),
  },
  {
    variant: "quiet",
    render: (props) => <IconButton label="Close tab" icon={<CloseIcon />} {...props} />,
  },
  {
    variant: "destructive",
    render: (props) => (
      <Button variant="destructive" {...props}>
        Abandon run
      </Button>
    ),
  },
  {
    variant: "destructive-confirm",
    render: (props) => (
      <Button variant="destructive-confirm" {...props}>
        Abandon
      </Button>
    ),
  },
];

/**
 * Every variant pinned in every state: a row per state, a column per variant. Inert, so the
 * specimens never join the tab order.
 */
function StateMatrix() {
  return (
    <div className="overflow-x-auto bg-panel p-6" inert>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Button variants in each state</caption>
        <thead>
          <tr>
            <th scope="col" className="pr-4 pb-4 font-normal text-smoke type-ui-s">
              State
            </th>
            {rows.map((row) => (
              <th
                key={row.variant}
                scope="col"
                className="pr-4 pb-4 font-normal whitespace-nowrap text-smoke type-data-s"
              >
                {row.variant}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {states.map((state) => (
            <tr key={state.name} className="border-t border-line-faint">
              <th scope="row" className="py-3 pr-4 font-normal text-ash type-ui">
                {state.name}
              </th>
              {rows.map((row) => (
                <td key={row.variant} className="py-3 pr-4">
                  {row.render(state.props)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Live buttons: click them, tab to them, wait on them. */
function LiveButtons() {
  const { show } = useToast();
  const platform = usePlatform();
  const [previewing, setPreviewing] = useState(false);

  const preview = () => {
    setPreviewing(true);
    window.setTimeout(() => {
      setPreviewing(false);
      show({ tone: "success", title: "Preview ran", description: "1,204 rows in 38ms." });
    }, 1200);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 bg-panel p-6">
      <Tooltip content="The engine is still warming up (62%).">
        <Button
          variant="primary"
          size="lg"
          disabled
          aria-keyshortcuts={ariaKeyShortcuts(runKeys, platform)}
        >
          Run the night
          <Shortcut keys={runKeys} aria-hidden />
        </Button>
      </Tooltip>
      <Button
        variant="secondary"
        size="lg"
        loading={previewing}
        onClick={preview}
        aria-keyshortcuts={ariaKeyShortcuts(previewKeys, platform)}
      >
        Preview
        <Shortcut keys={previewKeys} aria-hidden />
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          show({ tone: "info", title: "Formatted", description: "gold.cursed_houses.sql" });
        }}
      >
        Format
      </Button>
      <Button variant="ghost" size="sm">
        Small
      </Button>
    </div>
  );
}

export function ButtonSection() {
  return (
    <Section
      id="buttons"
      eyebrow="Button"
      title="Buttons"
      intro="One lit action per screen. Disabled buttons stay in the tab order so their tooltip can say why."
    >
      <Specimen label="Pinned states">
        <StateMatrix />
      </Specimen>
      <Specimen label="Live: the disabled one explains itself; Preview works for a moment">
        <LiveButtons />
      </Specimen>
    </Section>
  );
}
