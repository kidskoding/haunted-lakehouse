"use client";

import { useState } from "react";
import { Tab, TabList, TabMarker, TabPanel, Tabs } from "@/components/ui/tabs";
import { Section, Specimen } from "./section";

const models = [
  {
    value: "gold.porch_lights",
    sql: "select house_id, last_state\nfrom silver.light_events\nqualify row_number() over (partition by house_id order by ts desc) = 1",
  },
  {
    value: "silver.light_events",
    sql: "select house_id, state, ts\nfrom bronze.porch_events\nwhere state is not null",
  },
  { value: "gold.cursed_houses", sql: "select house_id\nfrom silver.bowls\nwhere pieces = 13 13" },
] as const;

function LiveTabs() {
  const [value, setValue] = useState<string>(models[0].value);
  return (
    <Tabs value={value} onValueChange={setValue} className="bg-panel">
      <TabList aria-label="Open models" className="px-2 pt-2">
        <Tab value={models[0].value}>
          {models[0].value}
          <TabMarker tone="unsaved" label="unsaved changes" />
        </Tab>
        <Tab value={models[1].value}>{models[1].value}</Tab>
        <Tab value="gold.ledger" disabled>
          gold.ledger
        </Tab>
        <Tab value={models[2].value}>
          {models[2].value}
          <TabMarker tone="error" label="has an error" />
        </Tab>
      </TabList>
      {models.map((model) => (
        <TabPanel key={model.value} value={model.value} className="bg-inset p-4">
          <pre className="whitespace-pre-wrap text-parchment type-code">{model.sql}</pre>
        </TabPanel>
      ))}
      <TabPanel value="gold.ledger" />
    </Tabs>
  );
}

/** Each tab state pinned; inert, so it never joins the tab order. */
function PinnedTabs() {
  return (
    <div inert className="bg-panel px-2 pt-2">
      <Tabs defaultValue="selected">
        <TabList aria-label="Tab states">
          <Tab value="selected">Selected</Tab>
          <Tab value="rest">Rest</Tab>
          <Tab value="hover" data-preview-state="hover">
            Hover
          </Tab>
          <Tab value="focus" data-preview-state="focus">
            Focus
          </Tab>
          <Tab value="pressed" data-preview-state="hover active">
            Pressed
          </Tab>
          <Tab value="disabled" disabled>
            Disabled
          </Tab>
          <Tab value="unsaved">
            Unsaved
            <TabMarker tone="unsaved" label="unsaved changes" />
          </Tab>
          <Tab value="error">
            Error
            <TabMarker tone="error" label="has an error" />
          </Tab>
        </TabList>
      </Tabs>
    </div>
  );
}

export function TabsSection() {
  return (
    <Section
      id="tabs"
      title="Tabs"
      intro="Arrow keys move and select, Home and End jump to the ends, and Tab drops into the open panel. Disabled tabs are skipped."
    >
      <Specimen label="Pinned states">
        <PinnedTabs />
      </Specimen>
      <Specimen label="Live: per-model editor tabs">
        <LiveTabs />
      </Specimen>
    </Section>
  );
}
