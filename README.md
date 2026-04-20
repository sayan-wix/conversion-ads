# Conversion Ads

A web app that generates Meta-ready evergreen ad copy in the voice of Zac / Ben Valen,
grounded in a 1,059-line master pattern library. Never fabricates proof. Never uses
AI-slop phrases.

## Quickstart

```bash
cp .env.example .env.local
# edit .env.local and set ANTHROPIC_API_KEY

npm install
npm run dev
# → http://localhost:3000
```

## How it works

1. User fills a 6-step wizard (product, audience, promise, mechanism, proof, CTA).
2. Picks one of 5 frameworks: Client Story, Belief Shifter, Why/What/How, Direct/Short, Problem/Solution Story.
3. `/api/generate` calls the Anthropic API (Sonnet 4.6 by default) with:
   - **Cached system prompt**: pattern library + hard guardrails (~95KB, stable)
   - **Dynamic system block**: the chosen framework's directives
   - **User message**: wizard inputs in `<product>`, `<audience>`, etc. tags
4. Response streams back live. Each section (`[HOOK]` / `[BODY]` / `[PROOF]` / `[CTA]`) can be edited inline or regenerated individually.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for full architecture docs, key files, and the Mistakes List.

## Deployment (Vercel)

1. Push this repo to GitHub.
2. Import into Vercel.
3. Set environment variables in the Vercel dashboard:
   - `ANTHROPIC_API_KEY` *(required)*
   - `ANTHROPIC_MODEL` *(optional, defaults to `claude-sonnet-4-6`)*
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` *(recommended for prod)*
4. Deploy. That's it.

## Re-ingesting new source documents

Drop a new PDF/docx of ad frameworks into the parent folder, then:

```bash
# With Claude Code CLI at the project root:
claude /source-preprocessor
claude /knowledge-extractor
claude /pattern-library-builder

# Then in conversion-ads/:
cp ../_preprocessed/pattern-library.md content/pattern-library.md
npm run build  # auto-regenerates the embedded TS version
git commit -am "content: refresh pattern library"
git push       # Vercel auto-deploys
```

## Tech

Next.js 16 · TypeScript · Tailwind 4 · shadcn/ui · Anthropic SDK · Upstash Ratelimit · Zod
