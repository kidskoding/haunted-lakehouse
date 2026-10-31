"use client";

import { cx } from "@/components/ui/cx";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { ButtonSection } from "./button-section";
import { DialogSection } from "./dialog-section";
import { PanelSection } from "./panel-section";
import { TabsSection } from "./tabs-section";
import { TooltipSection, KbdSection } from "./tooltip-section";
import { ToastSection } from "./toast-section";

const contents = [
  { id: "buttons", title: "Buttons" },
  { id: "kbd", title: "Keyboard hints" },
  { id: "tooltips", title: "Tooltips" },
  { id: "tabs", title: "Tabs" },
  { id: "panels", title: "Panels" },
  { id: "dialogs", title: "Dialogs" },
  { id: "toasts", title: "Toasts" },
] as const;

export function Gallery() {
  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-page flex-col gap-24 px-8 py-16">
        <header className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex max-w-reading flex-col gap-3">
            <h1 className="text-balance text-parchment type-display-m">Core components</h1>
            <p className="text-pretty text-ash type-prose">
              Every control the run screen is built from, in every state. Pinned specimens show
              hover, focus, and pressed at once; the live ones below them answer to mouse and
              keyboard. This page exists only in development.
            </p>
          </div>
          <nav aria-label="Components" className="rounded-s bg-panel p-2">
            <ul className="grid grid-cols-2 gap-0.5">
              {contents.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={cx(
                      "flex h-9 items-center rounded-xs px-3 text-ash type-ui",
                      "transition-colors duration-fast ease-out",
                      "hover:bg-raised hover:text-parchment active:bg-fog",
                    )}
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
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
