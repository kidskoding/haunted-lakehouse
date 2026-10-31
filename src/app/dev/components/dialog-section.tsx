"use client";

import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import {
  Dialog,
  DialogActions,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertIcon, CloseIcon } from "@/components/ui/icons";
import { Shortcut } from "@/components/ui/kbd";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Section, Specimen } from "./section";

const sheet = [
  { action: "Preview", keys: ["Mod", "Enter"] },
  { action: "Run the night", keys: ["Mod", "Shift", "Enter"] },
  { action: "New model", keys: ["Mod", "N"] },
  { action: "Skip a moment", keys: ["Escape"] },
] as const;

function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Keyboard shortcuts
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex items-start justify-between gap-4">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogClose>
            {(close) => (
              <Tooltip content="Close" side="left">
                <IconButton label="Close" icon={<CloseIcon />} onClick={close} className="-mr-2" />
              </Tooltip>
            )}
          </DialogClose>
        </div>
        <DialogDescription>Every action in the run screen, from the keyboard.</DialogDescription>
        <dl className="grid grid-cols-[1fr_auto] gap-y-3 border-t border-line-faint pt-4">
          {sheet.map((row) => (
            <div key={row.action} className="contents">
              <dt className="text-ash type-ui">{row.action}</dt>
              <dd className="justify-self-end">
                <Shortcut keys={row.keys} />
              </dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </>
  );
}

type AbandonState = "asking" | "working" | "failed";

/** A destructive confirm: the safe choice holds focus, and the first attempt fails. */
function AbandonRun() {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AbandonState>("asking");
  const [attempts, setAttempts] = useState(0);

  const confirm = () => {
    setState("working");
    window.setTimeout(() => {
      if (attempts === 0) {
        setAttempts(1);
        setState("failed");
        return;
      }
      setOpen(false);
      show({
        tone: "warning",
        title: "Run abandoned",
        description: "Your pipeline is in the Graveyard.",
      });
    }, 1000);
  };

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setState("asking");
          setAttempts(0);
          setOpen(true);
        }}
      >
        Abandon run
      </Button>
      <Dialog open={open} onOpenChange={setOpen} role="alertdialog" closeOnBackdrop={false}>
        <DialogTitle>Abandon this run?</DialogTitle>
        <DialogDescription>
          The night ends here. Your pipeline goes to the Graveyard and the seed is kept so you can
          try it again.
        </DialogDescription>
        {state === "failed" ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xs border-l-3 border-snuffed bg-tint-snuffed px-3 py-2 text-parchment type-ui"
          >
            <AlertIcon className="mt-0.5 text-snuffed" />
            The Crypt didn&rsquo;t answer. Your run is still going; try again.
          </p>
        ) : null}
        <DialogActions>
          <DialogClose>
            {(close) => (
              <Button onClick={close} data-autofocus>
                Not yet
              </Button>
            )}
          </DialogClose>
          <Button variant="destructive-confirm" loading={state === "working"} onClick={confirm}>
            {state === "failed" ? "Try again" : "Abandon"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function DialogSection() {
  return (
    <Section
      id="dialogs"
      eyebrow="Dialog"
      title="Dialogs"
      intro="Modal, on the native dialog element. Focus stays inside until it closes, Escape closes it, and focus goes back to the button that opened it."
    >
      <div className="flex flex-wrap gap-12">
        <Specimen label="Information, closes on Escape or the backdrop">
          <div className="bg-panel p-4">
            <ShortcutSheet />
          </div>
        </Specimen>
        <Specimen label="Destructive confirm: loading, then an error, then success">
          <div className="bg-panel p-4">
            <AbandonRun />
          </div>
        </Specimen>
      </div>
    </Section>
  );
}
