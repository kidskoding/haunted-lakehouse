"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HourIntro } from "@/components/run/hour-intro";
import { TopBar } from "@/components/run/top-bar";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { ToastProvider } from "@/components/ui/toast";
import type { IntroFixture } from "./fixtures";

export function Gallery({
  fixtures,
  current,
}: {
  readonly fixtures: readonly IntroFixture[];
  readonly current: IntroFixture;
}) {
  const [open, setOpen] = useState(true);
  const [take, setTake] = useState(0);
  const story = useRef<HTMLParagraphElement>(null);
  const begun = useRef(false);

  // Once the intro is gone the story is what the player reads next, so the focus goes there.
  useEffect(() => {
    if (!open && begun.current) story.current?.focus();
  }, [open]);

  return (
    <ToastProvider>
      <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-8 px-8 py-12 3xl:max-w-none">
        <header className="flex flex-col gap-4">
          <h1 className="text-parchment type-display-m">Hour intros</h1>
          <nav aria-label="Fixtures">
            <ul className="flex flex-wrap gap-2">
              {fixtures.map((fixture) => (
                <li key={fixture.id}>
                  <Link
                    href={`/dev/intros?fixture=${fixture.id}`}
                    aria-current={fixture.id === current.id ? "page" : undefined}
                    className={cx(
                      "block rounded-xs px-3 py-1.5 type-ui transition-colors duration-instant",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow",
                      fixture.id === current.id
                        ? "bg-tint-flame font-semibold text-parchment"
                        : "text-ash ui-hover:bg-raised ui-hover:text-parchment",
                    )}
                  >
                    {fixture.caption}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              disabled={open}
              onClick={() => {
                setOpen(true);
                setTake(take + 1);
              }}
            >
              Play it again
            </Button>
            <p role="status" className="text-ash type-ui">
              {open ? "" : "The hour is open."}
            </p>
          </div>
        </header>

        {/* The run screen, a moment after the hour opens; inert while the intro holds it. */}
        <div data-frame="" className="relative h-200 overflow-hidden bg-night">
          <div inert={open} className="flex h-full flex-col">
            <TopBar view={current.topBar} />
            <div className="grid flex-1 grid-cols-[2fr_3fr] gap-1 p-1">
              <Panel>
                <PanelHeader>
                  <PanelTitle>Story</PanelTitle>
                </PanelHeader>
                <PanelBody>
                  <p
                    ref={story}
                    tabIndex={-1}
                    className="max-w-story text-pretty text-parchment italic outline-none type-prose"
                  >
                    The hour&rsquo;s problem, in a character&rsquo;s voice, waits here.
                  </p>
                </PanelBody>
              </Panel>
              <Panel>
                <PanelHeader>
                  <PanelTitle>Editor</PanelTitle>
                </PanelHeader>
                <PanelBody>
                  <pre className="rounded-s bg-inset p-4 text-parchment type-code">
                    {"select house_id, state\nfrom bronze.porch_events\n"}
                  </pre>
                </PanelBody>
              </Panel>
            </div>
          </div>
          {open ? (
            <HourIntro
              key={take}
              boss={current.boss}
              curse={current.curse}
              onBegin={() => {
                begun.current = true;
                setOpen(false);
              }}
            />
          ) : null}
        </div>
      </main>
    </ToastProvider>
  );
}
