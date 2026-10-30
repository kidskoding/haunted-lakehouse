import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">{site.name}</h1>
      <p className="text-lg text-neutral-300">{site.tagline}</p>
    </main>
  );
}
