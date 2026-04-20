"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FRAMEWORKS, type FrameworkId } from "@/lib/prompt/frameworks";
import {
  Copy,
  RefreshCw,
  ArrowLeft,
  RotateCcw,
  Check,
  AlertTriangle,
  Loader2,
  Pencil,
  X,
} from "lucide-react";

type Input = {
  product: string;
  audience: string;
  promise: string;
  mechanism: string;
  proof?: string;
  cta: string;
  framework: FrameworkId;
};

type Sections = {
  hook: string;
  body: string;
  proof: string;
  cta: string;
};

type SectionKey = keyof Sections;

const EMPTY_SECTIONS: Sections = { hook: "", body: "", proof: "", cta: "" };

// Parse text containing [HOOK]/[BODY]/[PROOF]/[CTA] markers into sections.
// Tolerates partial streams (incomplete sections stay in whatever is currently being streamed).
function parseSections(raw: string): Sections {
  const out: Sections = { ...EMPTY_SECTIONS };
  if (!raw) return out;

  // Normalize markers
  const markerRe = /\[(HOOK|BODY|PROOF|CTA)\]/gi;
  const matches: { key: SectionKey; idx: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(raw)) !== null) {
    matches.push({
      key: m[1].toLowerCase() as SectionKey,
      idx: m.index,
      end: m.index + m[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const text = raw.slice(cur.end, next ? next.idx : raw.length).trim();
    out[cur.key] = text;
  }
  return out;
}

function sectionsToFullAd(s: Sections, skipProof: boolean): string {
  const parts: string[] = [];
  if (s.hook) parts.push(s.hook);
  if (s.body) parts.push(s.body);
  if (!skipProof && s.proof && s.proof.trim().toUpperCase() !== "SKIP") {
    parts.push(s.proof);
  }
  if (s.cta) parts.push(s.cta);
  return parts.join("\n\n");
}

type Props = {
  input: Input;
  onStartOver: () => void;
  onBack: () => void;
};

export function AdOutput({ input, onStartOver, onBack }: Props) {
  const [raw, setRaw] = useState("");
  const [sections, setSections] = useState<Sections>(EMPTY_SECTIONS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<SectionKey | null>(null);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [copied, setCopied] = useState<SectionKey | "ALL" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Tick an elapsed-time counter while streaming so the user can see something
  // is happening during the long wait before Claude's first token.
  useEffect(() => {
    if (!isStreaming) return;
    const startedAt = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isStreaming]);

  useEffect(() => {
    setSections(parseSections(raw));
  }, [raw]);

  const framework = FRAMEWORKS[input.framework];
  const skipProof =
    !input.proof || sections.proof.trim().toUpperCase() === "SKIP";

  async function streamGenerate() {
    setIsStreaming(true);
    setError(null);
    setRaw("");
    setSections(EMPTY_SECTIONS);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // If validation failed, zod issues come back — format them readably
        if (j.error === "invalid_input" && Array.isArray(j.issues)) {
          const details = j.issues
            .map(
              (i: { path?: (string | number)[]; message?: string }) =>
                `${(i.path ?? []).join(".") || "?"}: ${i.message ?? "invalid"}`,
            )
            .join(" · ");
          throw new Error(`Validation failed — ${details}`);
        }
        throw new Error(
          j.message || j.error || `Generation failed (${res.status})`,
        );
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        // Strip server-sent zero-width-space heartbeats so they don't pollute the UI.
        const chunk = decoder.decode(value, { stream: true }).replace(/\u200B/g, "");
        if (!chunk) continue;
        acc += chunk;
        setRaw(acc);
      }

      // Server sentinel for a failure that happened after the response was already
      // streaming (can't change status code at that point).
      const errMatch = acc.match(/\[GENERATION_ERROR\]\s*([\s\S]+)/);
      if (errMatch) {
        throw new Error(errMatch[1].trim());
      }

      // If the stream closed without producing any real content, surface a useful
      // error instead of leaving the UI empty (most likely cause: Vercel 60s timeout
      // on an oversized prompt).
      if (!acc.trim()) {
        throw new Error(
          "No content was generated — the request may have timed out. Try shorter inputs or retry.",
        );
      }

      // Stream produced bytes but none of them contained the [HOOK]/[BODY]/[PROOF]/[CTA]
      // markers we parse against. That means we'd silently render empty cards — surface
      // the raw text as an error so the user sees what actually came back.
      if (!/\[(HOOK|BODY|PROOF|CTA)\]/i.test(acc)) {
        throw new Error(
          `Model returned text with no section markers. Raw output: ${acc.slice(0, 400)}${acc.length > 400 ? "…" : ""}`,
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function cancelStream() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setError("Generation cancelled.");
  }

  async function streamRegenerateSection(section: SectionKey) {
    setRegenerating(section);
    const prev = sections[section];
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          section,
          previousVersion: prev,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          j.message || j.error || `Regenerate failed (${res.status})`,
        );
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = parseSections(acc);
        // Merge only the regenerated section
        const updatedText =
          parsed[section] ||
          acc
            .replace(new RegExp(`\\[${section.toUpperCase()}\\]`, "i"), "")
            .trim();
        setSections((s) => ({ ...s, [section]: updatedText }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegenerating(null);
    }
  }

  // Kick off generation on mount
  useEffect(() => {
    streamGenerate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyText(text: string, key: SectionKey | "ALL") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function updateSection(k: SectionKey, v: string) {
    setSections((s) => ({ ...s, [k]: v }));
  }

  const sectionMeta: { key: SectionKey; label: string; skip?: boolean }[] = [
    { key: "hook", label: "Hook" },
    { key: "body", label: "Body" },
    { key: "proof", label: "Proof", skip: skipProof },
    { key: "cta", label: "CTA" },
  ];

  const fullAd = sectionsToFullAd(sections, skipProof);

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {framework.name}
          </Badge>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating… {elapsed > 0 ? `${elapsed}s` : ""}
            </span>
          )}
          {isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={cancelStream}
              type="button"
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} type="button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Edit inputs
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartOver} type="button">
            <RotateCcw className="mr-2 h-4 w-4" />
            Start over
          </Button>
        </div>
      </div>

      {isStreaming && !raw && elapsed >= 8 && (
        <Card className="border-muted-foreground/20 bg-muted/30">
          <CardContent className="p-3 text-xs text-muted-foreground">
            Claude is reading your inputs. With very long documents the first line
            of the ad can take 30 seconds to a couple of minutes to appear. You can
            cancel at any time.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="flex-1">
              <div className="font-medium text-destructive">{error}</div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7"
                onClick={streamGenerate}
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sectionMeta.map(({ key, label, skip }) => {
        if (skip) return null;
        const value = sections[key];
        const isEditing = editing === key;
        const isRegen = regenerating === key;

        return (
          <Card key={key} className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEditing(isEditing ? null : key)}
                  disabled={isStreaming || isRegen}
                  type="button"
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  {isEditing ? "Done" : "Edit"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => streamRegenerateSection(key)}
                  disabled={isStreaming || isRegen || !value}
                  type="button"
                >
                  {isRegen ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  {isRegen ? "..." : "Regen"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => copyText(value, key)}
                  disabled={!value}
                  type="button"
                >
                  {copied === key ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isEditing ? (
                <Textarea
                  value={value}
                  onChange={(e) => updateSection(key, e.target.value)}
                  rows={Math.max(3, value.split("\n").length + 1)}
                  className="text-sm"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed min-h-[1.5rem]">
                  {value || (isStreaming ? "…" : "")}
                </pre>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
        <Button
          variant="outline"
          onClick={streamGenerate}
          disabled={isStreaming}
          type="button"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate full ad
        </Button>
        <Button
          onClick={() => copyText(fullAd, "ALL")}
          disabled={!fullAd || isStreaming}
          type="button"
        >
          {copied === "ALL" ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy full ad
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
