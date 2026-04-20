"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Sparkles,
  ArrowRight,
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

type CopyKey = "AD" | "HEADLINES" | "BOTH";
type Target = "ad" | "headlines";

export function AdOutput({ input, onStartOver, onBack }: Props) {
  // Finalized (possibly user-edited) text for each block. Each has its own
  // stream target so we can generate them independently.
  const [ad, setAd] = useState("");
  const [headlines, setHeadlines] = useState("");

  const [isEditingAd, setIsEditingAd] = useState(false);
  const [isEditingHeadlines, setIsEditingHeadlines] = useState(false);

  // `activeTarget` says which block is currently streaming (if any). This drives
  // the spinner placement and which card shows the "…" placeholder.
  const [activeTarget, setActiveTarget] = useState<Target | null>(null);
  // `action` disambiguates initial generation vs. regenerate for the status label.
  const [action, setAction] = useState<"generate" | "regenerate" | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const framework = FRAMEWORKS[input.framework];
  const busy = activeTarget !== null;

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

  /**
   * Generic stream runner. Writes tokens into either `ad` or `headlines`
   * depending on `target`. Tracks the server's hb breadcrumbs so empty-output
   * failures surface "where the server was when it died" in the error banner.
   */
  async function runStream(
    endpoint: "/api/generate" | "/api/regenerate" | "/api/headlines",
    body: Record<string, unknown>,
    target: Target,
    phase: "generate" | "regenerate",
  ) {
    setError(null);
    setActiveTarget(target);
    setAction(phase);
    if (target === "ad") {
      setAd("");
      setIsEditingAd(false);
    } else {
      setHeadlines("");
      setIsEditingHeadlines(false);
    }

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
      let lastHb: { tag: string; at: string } | null = null;
      const hbRe = /<!--hb:([a-z]+):([0-9.]+s)-->/g;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        let chunk = decoder
          .decode(value, { stream: true })
          .replace(/\u200B/g, "");
        // Extract every breadcrumb from this chunk (last one wins) then strip.
        let hbMatch: RegExpExecArray | null;
        hbRe.lastIndex = 0;
        // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
        while ((hbMatch = hbRe.exec(chunk)) !== null) {
          lastHb = { tag: hbMatch[1], at: hbMatch[2] };
        }
        chunk = chunk.replace(/<!--hb:[a-z]+:[0-9.]+s-->\n?/g, "");
        if (!chunk) continue;
        acc += chunk;
        if (target === "ad") setAd(acc);
        else setHeadlines(acc);
      }

      const errMatch = acc.match(/\[GENERATION_ERROR\]\s*([\s\S]+)/);
      if (errMatch) {
        if (target === "ad") setAd("");
        else setHeadlines("");
        throw new Error(errMatch[1].trim());
      }

      if (!acc.trim()) {
        const where = lastHb
          ? `Last server breadcrumb: ${lastHb.tag} at ${lastHb.at}. `
          : "No server breadcrumbs received. ";
        const hint =
          lastHb && lastHb.tag !== "done"
            ? "Looks like the server was cut off before Claude finished. "
            : "";
        throw new Error(
          `No content was generated. ${where}${hint}Retry, or reduce input size if this is repeating.`,
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      abortRef.current = null;
      setActiveTarget(null);
      setAction(null);
    }
  }

  /** Initial ad generation (runs once on mount). */
  async function streamGenerateAd() {
    await runStream("/api/generate", input, "ad", "generate");
  }

  /** Regenerate the ad with a different angle. Clears headlines since they're
   *  now stale for the new ad. */
  async function regenerateAd() {
    await runStream(
      "/api/regenerate",
      { ...input, previousVersion: ad },
      "ad",
      "regenerate",
    );
    setHeadlines("");
  }

  /** Step 2: generate the 20 headlines for the current ad. */
  async function streamGenerateHeadlines() {
    if (!ad.trim()) return;
    await runStream(
      "/api/headlines",
      { ...input, adText: ad },
      "headlines",
      "generate",
    );
  }

  /** Regenerate just the headlines (ad stays). */
  async function regenerateHeadlines() {
    if (!ad.trim()) return;
    await runStream(
      "/api/headlines",
      { ...input, adText: ad, previousHeadlines: headlines },
      "headlines",
      "regenerate",
    );
  }

  function cancelStream() {
    abortRef.current?.abort();
    setActiveTarget(null);
    setAction(null);
    setError("Generation cancelled.");
  }

  useEffect(() => {
    streamGenerateAd();
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

  const adReady = Boolean(ad.trim()) && activeTarget !== "ad";
  const busyLabel =
    action === "regenerate"
      ? activeTarget === "headlines"
        ? "Regenerating headlines"
        : "Regenerating ad"
      : activeTarget === "headlines"
        ? "Generating headlines"
        : "Generating ad";
  const bothText = [
    ad,
    headlines && `\n\n--- 20 Headlines ---\n\n${headlines}`,
  ]
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            type="button"
            disabled={busy}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Edit inputs
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onStartOver}
            type="button"
            disabled={busy}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Start over
          </Button>
        </div>
      </div>

      {activeTarget === "ad" && !ad && elapsed >= 8 && (
        <Card className="border-muted-foreground/20 bg-muted/30">
          <CardContent className="p-3 text-xs text-muted-foreground">
            Claude is reading your inputs. With very long documents the first
            line of the ad can take 30 seconds to a couple of minutes to appear.
            You can cancel at any time.
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
                onClick={ad.trim() ? streamGenerateHeadlines : streamGenerateAd}
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
                onClick={regenerateAd}
                disabled={busy || !ad}
                type="button"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                Redo
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
              {ad || (activeTarget === "ad" ? "…" : "")}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* ===== STEP 2 CTA — only shown once the ad is ready AND we haven't
          generated headlines yet AND nothing is streaming. ===== */}
      {adReady && !headlines && activeTarget !== "headlines" && (
        <div className="flex justify-center pt-1">
          <Button
            onClick={streamGenerateHeadlines}
            disabled={busy}
            type="button"
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Generate 20 headlines
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ===== HEADLINES BLOCK — shown once we're streaming into it or we have
          headlines to render. ===== */}
      {(activeTarget === "headlines" || headlines) && (
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
                  onClick={regenerateHeadlines}
                  disabled={busy || !headlines}
                  type="button"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Redo
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
                {headlines || (activeTarget === "headlines" ? "…" : "")}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {(ad || headlines) && (
        <div className="flex items-center justify-end gap-3 pt-2 flex-wrap">
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
                <Copy className="mr-2 h-4 w-4" />
                {headlines ? "Copy ad + headlines" : "Copy ad"}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
