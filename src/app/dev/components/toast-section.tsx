"use client";

import { Button } from "@/components/ui/button";
import { ToastCard, useToast } from "@/components/ui/toast";
import type { ToastInput } from "@/components/ui/toast-queue";
import { Section, Specimen } from "./section";

const examples: readonly ToastInput[] = [
  {
    tone: "info",
    title: "The engine is warm",
    description: "Preview and Run the night are ready.",
  },
  { tone: "success", title: "Copied", description: "12 rows, as tab-separated text." },
  {
    tone: "warning",
    title: "Batch 3 leaves retention next",
    description: "bronze.porch_events keeps only the last 3 batches.",
  },
  {
    tone: "error",
    title: "The night couldn't run",
    description: "The engine stopped mid-batch. No candle was lost.",
  },
];

const buttonLabels = {
  info: "Show a notice",
  success: "Show a success",
  warning: "Show a warning",
  error: "Show an error",
} as const;

export function ToastSection() {
  const { show } = useToast();
  return (
    <Section
      id="toasts"
      title="Toasts"
      intro="Bottom right, two at a time. Notices and successes fade after five seconds unless hovered or focused; warnings and errors wait for the player."
    >
      <Specimen label="Live">
        <div className="flex flex-wrap gap-3 bg-panel p-4">
          {examples.map((example) => (
            <Button
              key={example.tone}
              onClick={() => {
                show(example);
              }}
            >
              {buttonLabels[example.tone]}
            </Button>
          ))}
        </div>
      </Specimen>
      <Specimen label="Every tone">
        <div className="grid grid-cols-2 gap-4 bg-night">
          {examples.map((example) => (
            <ToastCard
              key={example.tone}
              tone={example.tone}
              title={example.title}
              description={example.description}
            />
          ))}
        </div>
      </Specimen>
    </Section>
  );
}
