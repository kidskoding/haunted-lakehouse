import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="type-display-l text-parchment">{site.name}</h1>
      <p className="type-prose text-ash">{site.tagline}</p>
    </main>
  );
}
