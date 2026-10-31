"use client";

import { useLinkStatus } from "next/link";

/**
 * The Graveyard's loading state. The room renders in one piece so it works without script, so
 * there is no skeleton; instead the link that was followed shows a lit dot in its corner until
 * the new hill arrives. Must sit inside a positioned `Link`.
 */
export function PendingMark() {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        aria-hidden="true"
        data-pending={pending ? "" : undefined}
        className="absolute top-1 right-1 size-1.5 rounded-full bg-flame opacity-0 transition-opacity duration-base ease-out data-pending:opacity-100 data-pending:delay-100 motion-calm:transition-none"
      />
      {pending ? <span className="sr-only">, reading the stones</span> : null}
    </>
  );
}
