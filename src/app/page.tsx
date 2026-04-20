import { Wizard } from "@/components/wizard/Wizard";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:py-16">
        <header className="w-full max-w-2xl text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Grounded in a 1,059-line proven pattern library
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Generate Meta ads that don&apos;t sound like AI.
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Answer 6 quick questions. Pick a proven framework. Get a complete ad
            in seconds — with per-section regenerate and inline edit.
          </p>
        </header>
        <Wizard />
        <footer className="text-center text-xs text-muted-foreground">
          Never fabricates proof. Banned AI-slop phrases are blocked at the source.
        </footer>
      </main>
    </div>
  );
}
