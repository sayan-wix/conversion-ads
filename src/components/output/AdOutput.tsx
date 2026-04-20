"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FRAMEWORKS, type FrameworkId } from "@/lib/prompt/frameworks";
import { HEADLINES_MARKER } from "@/lib/prompt/headlines";
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
  Sparkles,
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

type Props = {
  input: Input;
  onStartOver: () => void;
  onBack: () => void;
};

type Split = { ad: string; headlines: string };

/**
 * Split the stream into { ad, headlines } on the sentinel marker.
 * Robust to partial streams — if the marker hasn't arrived yet, headlines is "".
 * Tolerates case variations in the marker ("<<<Headlines>>>" etc.)
 */
function splitOutput(raw: string): Split {
  if (!raw) return { ad: "", headlines: "" };
  const markerRe = new RegExp(
    HEADLINES_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
  const m = raw.match(markerRe);
  if (!m || m.index === undefined) return { ad: raw, headlines: "" };
  return {
    ad: raw.slice(0, m.index).trim(),
    headlines: raw.slice(m.index + m[0].length).trim(),
  };
}

type CopyKey = "AD" | "HEADLINES" | "BOTH";

export function AdOutput({ input, onStartOver, onBack }: Props) {
  const [raw, setRaw] = useState("");

  // Finalized (possibly user-edited) text for each block. When streaming, these
  // track the split of `raw`. When the user edits, they diverge from `raw`.
  const [ad, setAd] = useState("");
  const [headlines, setHeadlines] = useState("");

  const [isEditingAd, setIsEditingAd] = useState(false);
  const [isEditingHeadlines, setIsEditingHeadlines] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const framework = FRAMEWORKS[input.framework];
  const busy = isStreaming || isRegenerating;

  // Mirror stream buffer into the two rendered blocks unless the user is editing.
  useEffect(() => {
    const s = splitOutput(raw);
    if (!isEditingAd) setAd(s.ad);
    if (!isEditingHeadlines) setHeadlines(s.headlines);
  }, [raw, isEditingAd, isEditingHeadlines]);

  // Elapsed-time counter during any in-flight stream.
  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [busy]);

  async function runStream(
    endpoint: "/api/generate" | "/api/regenerate",
    body: Record<string, unknown>,
    onDone: () => void,
  ) {
    setError(null);
    setRaw("");
    setAd("");
    setHeadlines("");
    setIsEditingAd(false);
    setIsEditingHeadlines(false);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.error === "invalid_input" && Array.isArray(j.issues)) {
          const details = j.issues
            .map(
              (i: { path?: (string | number)[]; message?: string }) =>
                `${(i.path ?? []).join(".") || "?"}: ${i.message ?? "invalid"}`,
            )
            .join(" · ");
          throw new Error(`Validation failed. ${details}`);
        }
        throw new Error(
          j.message || j.error || `Request failed (${res.status})`,
        );
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true }).replace(/\u200B/g, "");
        if (!chunk) continue;
        acc += chunk;
        setRaw(acc);
      }

      const errMatch = acc.match(/\[GENERATION_ERROR\]\s*([\s\S]+)/);
      if (errMatch) throw new Error(errMatch[1].trim());

      if (!acc.trim()) {
        throw new Error(
          "No content was generated. The request may have timed out. Retry or trim very large inputs.",
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      abortRef.current = null;
      onDone();
    }
  }

  async function streamGenerate() {
    setIsStreaming(true);
    await runStream("/api/generate", input, () => setIsStreaming(false));
  }

  async function regenerateAll() {
    setIsRegenerating(true);
    const previous = [ad, HEADLINES_MARKER, headlines].filter(Boolean).join("\n\n");
    await runStream(
      "/api/regenerate",
      { ...input, previousVersion: previous },
      () => setIsRegenerating(false),
    );
  }

  function cancelStream() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsRegenerating(false);
    setError("Generation cancelled.");
  }

  useEffect(() => {
    streamGenerate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyText(text: string, key: CopyKey) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const busyLabel = isRegenerating ? "Regenerating" : "Generating";
  const bothText = [ad, headlines && `\n\n--- 20 Headlines ---\n\n${headlines}`]
    .filter(Boolean)
    .join("");

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {framework.name}
          </Badge>
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {busyLabel}… {elapsed > 0 ? `${elapsed}s` : ""}
            </span>
          )}
          {busy && (
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
          <Button variant="ghost" size="sm" onClick={onBack} type="button" disabled={busy}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Edit inputs
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartOver} type="button" disabled={busy}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Start over
          </Button>
        </div>
      </div>

      {busy && !ad && elapsed >= 8 && (
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
                disabled={busy}
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== AD BLOCK ===== */}
      <Card className="overflow-hidden">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your ad
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsEditingAd((v) => !v)}
                disabled={busy || !ad}
                type="button"
              >
                <Pencil className="mr-1 h-3 w-3" />
                {isEditingAd ? "Done" : "Edit"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => copyText(ad, "AD")}
                disabled={!ad || busy}
                type="button"
              >
                {copied === "AD" ? (
                  <>
                    <Check className="mr-1 h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {isEditingAd ? (
            <Textarea
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              rows={Math.max(12, ad.split("\n").length + 2)}
              className="text-base leading-relaxed"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed min-h-[12rem]">
              {ad || (busy ? "…" : "")}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* ===== HEADLINES BLOCK ===== */}
      <Card className="overflow-hidden">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              20 Headlines (5 short · 5 longer · 5 power-word · 5 polarizing)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsEditingHeadlines((v) => !v)}
                disabled={busy || !headlines}
                type="button"
              >
                <Pencil className="mr-1 h-3 w-3" />
                {isEditingHeadlines ? "Done" : "Edit"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => copyText(headlines, "HEADLINES")}
                disabled={!headlines || busy}
                type="button"
              >
                {copied === "HEADLINES" ? (
                  <>
                    <Check className="mr-1 h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {isEditingHeadlines ? (
            <Textarea
              value={headlines}
              onChange={(e) => setHeadlines(e.target.value)}
              rows={Math.max(24, headlines.split("\n").length + 2)}
              className="text-sm leading-relaxed font-mono"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed min-h-[8rem]">
              {headlines ||
                (busy
                  ? "Headlines will appear here once the ad finishes streaming…"
                  : "")}
            </pre>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
        <Button
          variant="outline"
          onClick={regenerateAll}
          disabled={busy || (!ad && !headlines)}
          type="button"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Regenerate (new angle)
        </Button>
        <Button
          onClick={() => copyText(bothText, "BOTH")}
          disabled={(!ad && !headlines) || busy}
          type="button"
        >
          {copied === "BOTH" ? (
            <>
              <Check className="mr-2 h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" /> Copy ad + headlines
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
