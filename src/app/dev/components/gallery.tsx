"use client";

import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { ButtonSection } from "./button-section";
import { DialogSection } from "./dialog-section";
import { PanelSection } from "./panel-section";
import { TabsSection } from "./tabs-section";
import { TooltipSection, KbdSection } from "./tooltip-section";
import { ToastSection } from "./toast-section";

export function Gallery() {
  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-page flex-col gap-16 px-8 py-16">
        <header className="flex max-w-reading flex-col gap-3">
          <p className="text-flame type-label-caps">Development · 4.3</p>
          <h1 className="text-balance text-parchment type-display-l">Core components</h1>
          <p className="text-pretty text-ash type-prose">
            Every control the run screen is built from, in every state. Pinned specimens show hover,
            focus, and pressed at once; the live ones below them answer to mouse and keyboard.
          </p>
        </header>
        <ButtonSection />
        <KbdSection />
        <TooltipSection />
        <TabsSection />
        <PanelSection />
        <DialogSection />
        <ToastSection />
      </main>
      <ToastViewport />
    </ToastProvider>
  );
}
