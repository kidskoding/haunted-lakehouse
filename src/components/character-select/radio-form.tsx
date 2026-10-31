"use client";

import type { ComponentPropsWithRef, KeyboardEvent } from "react";

// Browsers submit a form on Enter only from text fields; the radio group confirms on Enter too.
function submitFromRadio(event: KeyboardEvent<HTMLFormElement>) {
  const { target } = event;
  if (event.key !== "Enter" || !(target instanceof HTMLInputElement) || target.type !== "radio") {
    return;
  }
  event.preventDefault();
  event.currentTarget.requestSubmit();
}

/** A form whose radios confirm on Enter, as its text fields would. */
export function RadioForm(props: Omit<ComponentPropsWithRef<"form">, "onKeyDown">) {
  return <form {...props} onKeyDown={submitFromRadio} />;
}
