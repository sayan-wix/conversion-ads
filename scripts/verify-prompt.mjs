#!/usr/bin/env node
/**
 * Smoke test the prompt engine. Asserts:
 *  - system prompt contains the pattern library, guardrails, and chosen framework
 *  - cache_control is set on the stable prefix only
 *  - guardrail scanner catches known bad phrases
 *  - fabricated-proof scanner catches red flags when proof is missing
 *
 * Runs in Node via tsx. Fast, no external deps.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Use tsx to run a TS checker script
const src = `
import { buildSystemBlocks, buildUserMessage } from "../src/lib/prompt/system";
import { scanForViolations, scanForFabricatedProof } from "../src/lib/prompt/guardrails";
import { FRAMEWORKS } from "../src/lib/prompt/frameworks";

const input = {
  product: "90-day online fitness coaching for men 40+",
  audience: "Men 40-55 who've tried every diet and nothing sticks",
  promise: "Lose 20 lbs in 90 days without giving up beer",
  mechanism: "Metabolic cycling — eat more 4 days/week, less for 3",
  proof: undefined,
  cta: "Book a free strategy call",
  framework: "belief-shifter" as const,
};

const blocks = buildSystemBlocks(input.framework);
if (blocks.length !== 2) throw new Error("expected 2 system blocks, got " + blocks.length);
if (!("cache_control" in blocks[0])) throw new Error("first block missing cache_control");
if ("cache_control" in blocks[1]) throw new Error("second block must NOT have cache_control");
if (!blocks[0].text.includes("PATTERN LIBRARY")) throw new Error("pattern library missing");
if (!blocks[0].text.includes("HARD RULES")) throw new Error("guardrails missing");
if (!blocks[1].text.includes(FRAMEWORKS["belief-shifter"].name)) throw new Error("framework name missing in dynamic block");
console.log("[OK] system blocks structured correctly (" + blocks[0].text.length + " chars cached, " + blocks[1].text.length + " dynamic)");

const msg = buildUserMessage(input);
if (!msg.includes("<product>")) throw new Error("missing <product> tag");
if (!msg.includes("<mechanism>")) throw new Error("missing <mechanism> tag");
if (!msg.includes("none supplied")) throw new Error("empty proof should produce explicit no-invent note");
console.log("[OK] user message assembled with all required tags");

// Guardrail scanner
const bad = "This is a game-changer that will revolutionize your life. Let's delve into how to leverage this.";
const hits = scanForViolations(bad);
if (hits.length < 3) throw new Error("scanner should catch at least 3 banned phrases, got " + hits.length);
console.log("[OK] guardrail scanner caught " + hits.length + " banned phrases");

// Fabricated proof scanner
const fake = "One of my clients, Sarah, a 42-year-old mom, lost 30 pounds in 8 weeks.";
const fakeHits = scanForFabricatedProof(fake, false);
if (fakeHits.length < 1) throw new Error("fabricated-proof scanner should flag 'one of my clients'");
console.log("[OK] fabricated-proof scanner caught " + fakeHits.length + " red flags");

// Same text but with proof supplied — should not flag (user likely provided that story)
const fakeHitsProof = scanForFabricatedProof(fake, true);
if (fakeHitsProof.length !== 0) throw new Error("scanner should NOT flag when user supplied proof");
console.log("[OK] fabricated-proof scanner respects user-supplied proof");

console.log("\\nAll prompt-engine smoke tests passed.");
`;

const checkerPath = path.join(root, "scripts", "_checker.ts");
import("node:fs").then((fs) => {
  fs.writeFileSync(checkerPath, src, "utf8");
  try {
    execSync(`npx tsx ${JSON.stringify(checkerPath)}`, { cwd: root, stdio: "inherit" });
    fs.unlinkSync(checkerPath);
  } catch (e) {
    try { fs.unlinkSync(checkerPath); } catch {}
    process.exit(1);
  }
});
