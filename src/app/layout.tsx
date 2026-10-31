import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EngineProvider } from "@/lib/engine/react";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: site.name,
  description: site.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">
        <EngineProvider>{children}</EngineProvider>
      </body>
    </html>
  );
}
