"use client";

import { Button, IconButton } from "@/components/ui/button";
import { AlertIcon, CloseIcon } from "@/components/ui/icons";
import { Kbd, Shortcut, usePlatform } from "@/components/ui/kbd";
import { ariaKeyShortcuts, type Platform } from "@/components/ui/shortcut";
import { Tooltip } from "@/components/ui/tooltip";
import { Section, Specimen } from "./section";

const formatKeys = ["Shift", "Alt", "F"] as const;

/** Lucide's align-left shape, on the same grid as the other glyphs. */
function FormatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M15 12H3M17 18H3M21 6H3" />
    </svg>
  );
}

function TooltipLabel({ name, keys }: { readonly name: string; readonly keys: readonly string[] }) {
  return (
    <span className="flex items-center gap-3">
      {name}
      <Shortcut keys={keys} aria-hidden />
    </span>
  );
}

export function TooltipSection() {
  const platform = usePlatform();
  return (
    <Section
      id="tooltips"
      eyebrow="Tooltip"
      title="Tooltips"
      intro="Shown on hover and on keyboard focus, dismissed with Escape, and kept open while the pointer rests on them."
    >
      <div className="flex flex-wrap items-start gap-12">
        <Specimen label="Live: icon buttons in a panel header">
          <div className="flex items-center gap-0.5 bg-panel p-3">
            <Tooltip content={<TooltipLabel name="Format SQL" keys={formatKeys} />} side="bottom">
              <IconButton
                label="Format SQL"
                icon={<FormatIcon />}
                aria-keyshortcuts={ariaKeyShortcuts(formatKeys, platform)}
              />
            </Tooltip>
            <Tooltip content="Close tab" side="bottom">
              <IconButton label="Close tab" icon={<CloseIcon />} />
            </Tooltip>
            <Tooltip content="No errors to jump to." side="bottom">
              <IconButton label="Jump to error" icon={<AlertIcon />} disabled />
            </Tooltip>
          </div>
        </Specimen>
        <Specimen label="Live: a disabled action and its reason">
          <div className="bg-panel p-3">
            <Tooltip content="Clear an hour to choose a relic.">
              <Button disabled>Use relic</Button>
            </Tooltip>
          </div>
        </Specimen>
        <Specimen label="Pinned open" className="pb-14">
          <div className="bg-panel p-3">
            <Tooltip
              defaultOpen
              side="bottom"
              content={
                <span className="flex flex-col gap-0.5">
                  <span className="text-parchment type-label-caps">Wren&rsquo;s Lantern</span>
                  <span className="text-ash">Reveals the schema history of one feed.</span>
                </span>
              }
            >
              <Button>Wren&rsquo;s Lantern</Button>
            </Tooltip>
          </div>
        </Specimen>
      </div>
    </Section>
  );
}

const shortcuts: readonly { readonly action: string; readonly keys: readonly string[] }[] = [
  { action: "Preview", keys: ["Mod", "Enter"] },
  { action: "Run the night", keys: ["Mod", "Shift", "Enter"] },
  { action: "Format SQL", keys: formatKeys },
  { action: "Skip", keys: ["Escape"] },
];

function ShortcutColumn({
  platform,
  label,
}: {
  readonly platform: Platform;
  readonly label: string;
}) {
  return (
    <Specimen label={label}>
      <dl className="grid grid-cols-[auto_auto] items-center justify-start gap-x-8 gap-y-3 bg-panel p-4">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.action} className="contents">
            <dt className="text-ash type-ui">{shortcut.action}</dt>
            <dd>
              <Shortcut keys={shortcut.keys} platform={platform} />
            </dd>
          </div>
        ))}
      </dl>
    </Specimen>
  );
}

export function KbdSection() {
  return (
    <Section
      id="kbd"
      eyebrow="Kbd hint"
      title="Keyboard hints"
      intro={
        <>
          Written once with a command key, shown the way each platform prints it. Press <Kbd>?</Kbd>{" "}
          for every shortcut.
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-12">
        <ShortcutColumn platform="mac" label="macOS" />
        <ShortcutColumn platform="other" label="Windows and Linux" />
        <Specimen label="On filled buttons, and disabled">
          <div className="flex flex-col items-start gap-3 bg-panel p-4" inert>
            <Button variant="primary" size="lg">
              Run the night
              <Shortcut keys={["Mod", "Shift", "Enter"]} aria-hidden />
            </Button>
            <Button variant="secondary" size="lg">
              Preview
              <Shortcut keys={["Mod", "Enter"]} aria-hidden />
            </Button>
            <Button variant="primary" size="lg" disabled>
              Run the night
              <Shortcut keys={["Mod", "Shift", "Enter"]} aria-hidden />
            </Button>
          </div>
        </Specimen>
      </div>
    </Section>
  );
}
