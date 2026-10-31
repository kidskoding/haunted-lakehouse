"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useSound } from "@/lib/sound/react";

function SpeakerIcon({ on }: Readonly<{ on: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor" stroke="none" />
      {on ? (
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.75 3.75a6 6 0 0 1 0 8.5" />
      ) : (
        <path d="M11 6l3.5 4M14.5 6L11 10" />
      )}
    </svg>
  );
}

/**
 * The sound toggle and volume slider. The toggle is the one click that turns sound on; the
 * slider can be set beforehand without making a noise.
 */
export function SoundControl({ className }: Readonly<{ className?: string }>) {
  const { status, muted, volume, setMuted, setVolume } = useSound();
  const sliderId = useId();
  const percent = Math.round(volume * 100);

  return (
    <div
      role="group"
      aria-label="Sound"
      data-sound-status={status}
      className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="md"
        aria-pressed={!muted}
        onClick={() => {
          setMuted(!muted);
        }}
        className="aria-pressed:border-flame aria-pressed:bg-tint-flame aria-pressed:text-parchment"
      >
        <span className={muted ? "text-smoke" : "text-flame"}>
          <SpeakerIcon on={!muted} />
        </span>
        Sound
      </Button>
      <label htmlFor={sliderId} className="sr-only">
        Volume
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={`${String(percent)}%`}
        onChange={(event) => {
          setVolume(event.currentTarget.valueAsNumber / 100);
        }}
        className="h-8 w-28 cursor-pointer accent-flame"
      />
      <output
        htmlFor={sliderId}
        aria-hidden="true"
        className="type-data-s w-9 tabular-nums text-smoke"
      >
        {percent}%
      </output>
    </div>
  );
}
