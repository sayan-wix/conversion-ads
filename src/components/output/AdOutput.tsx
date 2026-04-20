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

export function AdOutput({ input, onStartOver, onBack }: Props) {
  // `raw` is the live stream buffer. `ad` is the finalized (or user-edited) ad text
  // that we render. When streaming, ad tracks raw. When user edits, ad diverges.
  const [raw, setRaw] = useState("");
  const [ad, setAd] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const framework = FRAMEWORKS[input.framework];
  const busy = isStreaming || isRegenerating;

  // Mirror stream buffer into the ad text (unless the user is hand-editing).
  useEffect(() => {
    if (!isEditing) setAd(raw);
  }, [raw, isEditing]);

  // Elapsed-time counter while we're waiting on Claude.
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
    setIsEditing(false);

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
          throw new Error(`Validation failed — ${details}`);
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
          "No content was generated — the request may have timed out. Retry or trim very large inputs.",
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

  async function regenerateAd() {
    setIsRegenerating(true);
    await runStream(
      "/api/regenerate",
      { ...input, previousVersion: ad },
      () => setIsRegenerating(false),
    );
  }

  function cancelStream() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsRegenerating(false);
    setError("Generation cancelled.");
  }

  // Kick off first generation on mount.
  useEffect(() => {
    streamGenerate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyAd() {
    if (!ad) return;
    navigator.clipboard.writeText(ad).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const busyLabel = isRegenerating ? "Regenerating" : "Generating";

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
                onClick={() => setIsEditing((v) => !v)}
                disabled={busy || !ad}
                type="button"
              >
                <Pencil className="mr-1 h-3 w-3" />
                {isEditing ? "Done" : "Edit"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={copyAd}
                disabled={!ad || busy}
                type="button"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {isEditing ? (
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

      <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
        <Button
          variant="outline"
          onClick={regenerateAd}
          disabled={busy || !ad}
          type="button"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Regenerate (new angle)
        </Button>
        <Button onClick={copyAd} disabled={!ad || busy} type="button">
          {copied ? (
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
