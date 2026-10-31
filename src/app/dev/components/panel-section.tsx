"use client";

import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { Shortcut } from "@/components/ui/kbd";
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelSkeleton,
  PanelTitle,
} from "@/components/ui/panel";
import { Tooltip } from "@/components/ui/tooltip";
import { Section, Specimen } from "./section";

function CloseAction() {
  return (
    <PanelActions>
      <Tooltip content="Hide panel" side="left">
        <IconButton label="Hide panel" icon={<CloseIcon />} />
      </Tooltip>
    </PanelActions>
  );
}

/** The error state recovers: Retry loads, then the story arrives. */
function RecoveringPanel() {
  const [state, setState] = useState<"error" | "loading" | "ready">("error");
  return (
    <Panel className="h-60">
      <PanelHeader>
        <PanelTitle>Story</PanelTitle>
      </PanelHeader>
      <PanelBody>
        {state === "error" ? (
          <PanelError message="The story didn't arrive.">
            <Button
              size="sm"
              onClick={() => {
                setState("loading");
                window.setTimeout(() => {
                  setState("ready");
                }, 1200);
              }}
            >
              Retry
            </Button>
            <Button size="sm" variant="quiet">
              Copy details
            </Button>
          </PanelError>
        ) : null}
        {state === "loading" ? <PanelSkeleton label="Loading the story" /> : null}
        {state === "ready" ? (
          <p className="max-w-story text-pretty text-parchment type-prose-s">
            The porch lights of Hollow Creek blink on one by one.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

export function PanelSection() {
  return (
    <Section
      id="panels"
      title="Panels"
      intro="Flat regions told apart by fill. The panel holding focus lights its header with a flame bar."
    >
      <div className="grid grid-cols-2 gap-2 bg-night xl:grid-cols-3">
        <Specimen label="Focused (pinned)">
          <Panel className="h-60" data-preview-state="focus-within">
            <PanelHeader>
              <PanelTitle>Table browser</PanelTitle>
              <CloseAction />
            </PanelHeader>
            <PanelBody>
              <ul className="flex flex-col gap-1 type-data">
                <li className="text-parchment">bronze.porch_events</li>
                <li className="text-ash">bronze.sensor_status</li>
              </ul>
            </PanelBody>
          </Panel>
        </Specimen>
        <Specimen label="Rest (click inside to focus)">
          <Panel className="h-60">
            <PanelHeader>
              <PanelTitle>Results</PanelTitle>
              <CloseAction />
            </PanelHeader>
            <PanelBody>
              <p className="text-ash type-data">1,204 rows · 38ms</p>
            </PanelBody>
          </Panel>
        </Specimen>
        <Specimen label="Empty">
          <Panel className="h-60">
            <PanelHeader>
              <PanelTitle>Silver</PanelTitle>
            </PanelHeader>
            <PanelBody className="flex items-center">
              <PanelEmpty>
                No models here yet. <Shortcut keys={["Mod", "N"]} /> writes one.
              </PanelEmpty>
            </PanelBody>
          </Panel>
        </Specimen>
        <Specimen label="Loading">
          <Panel className="h-60">
            <PanelHeader>
              <PanelTitle>Story</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <PanelSkeleton label="Loading the story" />
            </PanelBody>
          </Panel>
        </Specimen>
        <Specimen label="Error, with recovery">
          <RecoveringPanel />
        </Specimen>
      </div>
    </Section>
  );
}
