@AGENTS.md

# CLAUDE.md — conversion-ads

> Project-level context for any Claude/LLM agent working on this codebase.
> Read this **before** touching code. The Mistakes List is the most important section.

## What this is

A public web app that generates Meta-ready evergreen ad copy in the voice of Zac / Ben Valen,
grounded in a 1,059-line master pattern library compiled from 4 source documents + a
Belief Engineering doctrine.

User fills a 5-step wizard → picks one of 5 frameworks → the Anthropic API produces an ad
with `[HOOK]` / `[BODY]` / `[PROOF]` / `[CTA]` sections. Inline-edit and per-section
regenerate are supported.

## How it works (architecture at a glance)

```
User wizard (5 steps)
   ↓ POST /api/generate  (Node runtime, streaming, rate-limited)
   ↓
   ├── System prompt (CACHED block):
   │     • content/pattern-library.md   (1,059 lines — the "anti-prompt")
   │     • Guardrails (banned phrases, fabrication rules)
   │
   ├── System prompt (DYNAMIC block):
   │     • Framework instructions for the one framework the user picked
   │
   └── User message:
         • <product>, <audience>, <promise>, <mechanism>, <proof>, <cta> tags
   ↓
   Anthropic Messages API (Sonnet 4.6 default, Opus 4.7 via env var)
   ↓
   Streamed response → parsed into 4 sections → rendered in output UI
```

**Prompt caching note:** Everything up to and including the guardrails is wrapped in one
`cache_control: { type: "ephemeral" }` breakpoint. The stable prefix must remain byte-identical
across requests or caching silently fails. Verify with `usage.cache_read_input_tokens > 0`.

**Library embedding:** `content/pattern-library.md` is embedded into the bundle at build time
via `scripts/embed-library.mjs` which writes `src/lib/generated/pattern-library.ts`. Runs
automatically on `predev` / `prebuild`. This means the library is available in any runtime
(no `fs` needed) and Vercel file tracing can't miss it.

## Stack

- **Framework:** Next.js 16.2 (App Router, Node runtime on `/api/generate`)
- **Language:** TypeScript (strict)
- **UI:** Tailwind 4 + shadcn/ui (Radix primitives)
- **LLM:** `@anthropic-ai/sdk`, model `claude-sonnet-4-6` (env-switchable to `claude-opus-4-7`)
- **Rate limiting:** `@upstash/ratelimit` + `@upstash/redis` (per-IP, 10/hr)
- **Validation:** Zod
- **Icons:** lucide-react
- **Deploy:** Vercel (`conversion-ads.vercel.app`)

## Key files

| Path | What it does |
|---|---|
| `src/app/page.tsx` | Landing + wizard entry |
| `src/app/api/generate/route.ts` | Generate endpoint (Node, streaming, `maxDuration = 60`) |
| `src/app/api/regenerate/route.ts` | Per-section regenerate endpoint |
| `src/components/wizard/*` | 5 wizard steps + framework picker |
| `src/components/output/*` | Ad renderer, section regen, copy button |
| `src/lib/anthropic.ts` | Anthropic client singleton + model resolver |
| `src/lib/ratelimit.ts` | Upstash limiter (no-op if env unset) |
| `src/lib/validate.ts` | Zod schemas for wizard input |
| `src/lib/prompt/system.ts` | System-prompt block assembly (+ cache) |
| `src/lib/prompt/frameworks.ts` | Framework directive strings |
| `src/lib/prompt/guardrails.ts` | Hard rules + post-gen scanner |
| `src/lib/generated/pattern-library.ts` | Auto-generated from `content/pattern-library.md` — do not hand-edit |
| `content/pattern-library.md` | The anti-prompt (regenerate via skill pipeline, then rerun `npm run build`) |
| `scripts/embed-library.mjs` | Build-time markdown → TS string converter |

## Commands

```bash
npm run dev          # local dev on :3000 (auto-embeds library)
npm run build        # production build (auto-embeds library)
npm run lint         # eslint
npm test             # unit tests (prompt engine + guardrails)
npm run embed        # manually regenerate src/lib/generated/pattern-library.ts
```

Environment: copy `.env.example` → `.env.local` and set `ANTHROPIC_API_KEY`.

## Re-ingesting new source documents

When the user drops a new ad doc into the repo root (or parent folder), rebuild the
pattern library with the Claude Code skills:

```bash
# 1. Preprocess the new doc(s) — extracts raw text, classifies routing
claude /source-preprocessor

# 2. Extract frameworks/patterns from the new raw text
claude /knowledge-extractor

# 3. Merge into pattern-library.md (deduplicates, re-ranks CORE/RECURRING/SINGLE)
claude /pattern-library-builder

# 4. Copy the updated library into the app, commit, push — Vercel redeploys
cp ../_preprocessed/pattern-library.md content/pattern-library.md
npm run build    # regenerates src/lib/generated/pattern-library.ts
git add content/pattern-library.md src/lib/generated/pattern-library.ts
git commit -m "content: refresh pattern library with new source"
git push
```

**No app code changes are needed when adding content.** The library is embedded into the
bundle and injected into the system prompt.

## Mistakes List (READ BEFORE CODING)

Things that have burned this project or are obvious failure modes. Add a new row any time
you catch yourself or a future agent making one of these.

### 1. NEVER fabricate social proof
The #1 reason AI-generated ads feel hollow is invented testimonials and "one of my clients…"
stories. The guardrail scanner in `src/lib/prompt/guardrails.ts` blocks this. **Do not
relax the scanner without replacing it with something equivalent.** If the user's `<proof>`
field is empty, the ad must be written without specific proof — not with fabricated proof.

### 2. The pattern library is the prompt, not a suggestion
`content/pattern-library.md` is not documentation — it is the cached system prompt body.
Any change to that file changes model behavior. Never hand-edit it; always regenerate it
via the skill pipeline (see "Re-ingesting" above).

### 3. Banned phrases are load-bearing
The phrases in `guardrails.ts` (`unlock the power`, `game-changer`, `revolutionize`,
`delve into`, `leverage`, etc.) are banned because they immediately signal "AI wrote this"
to trained marketers. The `scanForViolations` function MUST run on every generated ad.
If it finds a hit, surface the violation to the user instead of silently shipping slop.

### 4. API key is server-only
`ANTHROPIC_API_KEY` is used inside `src/lib/anthropic.ts` which is only imported by API
routes (server). Never import `anthropic.ts` from a client component. Never prefix the
env var with `NEXT_PUBLIC_`. If you see either, it's a security bug.

### 5. Field labels are directives, not hints
Wizard field labels like "What's the big promise?" are passed verbatim to the model inside
`<promise>` tags. If you rename a label, the model's behavior may subtly change. Treat
them like prompt edits.

### 6. Cache prefix must be byte-stable
The CACHED block in `buildSystemBlocks` must not contain timestamps, request IDs, or any
per-request value. Even a single byte of drift drops the cache hit rate to zero.
Verify with `usage.cache_read_input_tokens` in API responses during dev.

### 7. Model choice: Sonnet 4.6 is default, not a downgrade
This project deliberately runs on Sonnet 4.6 because the pattern library does the heavy
lifting — the model is doing retrieval + style-matching, not reasoning. Only flip to
`claude-opus-4-7` via env var if real-world outputs are weak. Do not change the default
in code.

### 8. Opus 4.7 has no `temperature` / `top_p` / `top_k` / `budget_tokens`
If someone switches to Opus 4.7, the API call must NOT send those params — it'll 400.
Use `thinking: { type: "adaptive" }` for Opus 4.7. Sonnet 4.6 accepts both styles.

### 9. Rate limiter fails open if Upstash is unset
`src/lib/ratelimit.ts` returns `ok: true` when `UPSTASH_REDIS_REST_URL` is missing. This
is intentional for local dev, but means **prod must set the Upstash env vars** or the
endpoint is unprotected. Check the Vercel env list before each deploy.

### 10. Don't collect emails in v1
Per user direction: the app shows the ad on screen with a copy button. No Resend, no email
capture, no KV storage, no lead database. If someone adds a "save my ad" button, that's a
v2 feature and needs explicit sign-off.

### 11. Next.js 16 breaking changes (per AGENTS.md)
- `context.params` in route handlers is a **Promise** — always `await params`.
- Default runtime is `nodejs`. Edge is opt-in via `export const runtime = 'edge'`.
- When in doubt, read `node_modules/next/dist/docs/` — it's the pinned, accurate version.

## What "done" looks like per phase

- **Phase 1** ✅ Scaffold + deps + structure + this CLAUDE.md
- **Phase 2** Prompt engine unit tests green (system prompt assembly, guardrail scanner)
- **Phase 3** 5-step wizard renders, validates, advances, and posts inputs
- **Phase 4** `/api/generate` streams a full ad from real inputs, rate-limited, guardrail-checked
- **Phase 5** Output UI: sections parsed, inline edit, per-section regen, copy-to-clipboard
- **Phase 6** Verification: generate across 3 test inputs × 5 frameworks = 15 ads, none fail scanner
- **Phase 7** Deployed to `conversion-ads.vercel.app`, env vars set, smoke test passes
- **Phase 8** This file's Mistakes List updated with anything learned during build
