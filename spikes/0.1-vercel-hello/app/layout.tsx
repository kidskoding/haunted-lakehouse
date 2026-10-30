import type { ReactNode } from "react";

export const metadata = { title: "Spike 0.1: Vercel hello" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
