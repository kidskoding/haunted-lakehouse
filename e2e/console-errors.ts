import type { Page } from "@playwright/test";

/**
 * Collects page errors, console errors, and failed requests. The site has no favicon yet,
 * so the browser's automatic favicon request is the one expected miss.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    // Failed loads are reported with their URL by the response listener below.
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname !== "/favicon.ico") {
      errors.push(`${String(response.status())} ${url.pathname}`);
    }
  });
  return errors;
}
