import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EngineProvider } from "@/lib/engine/react";
import { site } from "@/lib/site";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: site.name,
  description: site.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="type-ui min-h-dvh antialiased">
        <EngineProvider>{children}</EngineProvider>
      </body>
    </html>
  );
}
