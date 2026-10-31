import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EngineProvider } from "@/lib/engine/react";
import { SoundProvider } from "@/lib/sound/react";
import { site } from "@/lib/site";
import { fontVariables } from "./fonts";
import "./globals.css";

/*
 * The share image comes from opengraph-image.tsx and twitter-image.tsx; Next adds their
 * tags and, on Vercel, resolves them against the deployment's own URL.
 */
export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.tagline,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.name,
    description: site.tagline,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.tagline,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="type-ui min-h-dvh antialiased">
        <EngineProvider>
          <SoundProvider>{children}</SoundProvider>
        </EngineProvider>
      </body>
    </html>
  );
}
