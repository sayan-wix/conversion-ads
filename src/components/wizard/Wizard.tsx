"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FrameworkPicker } from "./FrameworkPicker";
import { AdOutput } from "@/components/output/AdOutput";
import type { FrameworkId } from "@/lib/prompt/frameworks";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Paperclip,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type WizardState = {
  product: string;
  audience: string;
  promise: string;
  mechanism: string;
  proof: string;
  cta: string;
  framework: FrameworkId | null;
};

const EMPTY: WizardState = {
  product: "",
  audience: "",
  promise: "",
  mechanism: "",
  proof: "",
  cta: "",
  framework: null,
};

type TextKey = Exclude<keyof WizardState, "framework">;

type Step = {
  key: TextKey | "framework";
  title: string;
  sub: string;
  placeholder?: string;
  multiline?: boolean;
  allowFileUpload?: boolean;
  rows?: number;
  optional?: boolean;
};

const STEPS: Step[] = [
  {
    key: "product",
    title: "What is your product or offer?",
    sub: "Name it, describe the format, duration, and what's included. Paste a full offer brief or attach a file if you have one.",
    placeholder:
      "e.g., 90-day online fitness coaching for men 40+ — weekly 1:1 calls, custom nutrition plan, private community, 3 workout protocols to rotate through…",
    multiline: true,
    allowFileUpload: true,
    rows: 10,
  },
  {
    key: "audience",
    title: "Who is this for? (your avatar)",
    sub: "Demographics, psychographics, pain points, what they've tried, what they secretly believe. The more detail, the sharper the ad. Paste or attach your full avatar document.",
    placeholder:
      "e.g., Men 40-55, married with kids, desk jobs, $100K+ household income. They've tried keto, intermittent fasting, CrossFit — everything works for 3 weeks then falls apart. Privately terrified of becoming 'the dad who let himself go.' Believe discipline is the problem when it's actually environment…",
    multiline: true,
    allowFileUpload: true,
    rows: 14,
  },
  {
    key: "promise",
    title: "What is the big promise?",
    sub: "The specific outcome they get. Vivid, measurable, time-bound when possible.",
    placeholder:
      "e.g., Lose 20 lbs in 90 days without giving up beer, living at the gym, or cooking separately from your family",
    multiline: true,
    allowFileUpload: true,
    rows: 6,
  },
  {
    key: "mechanism",
    title: "How does it work? (your mechanism)",
    sub: "The unique thing that makes the outcome happen. Your method, framework, angle, process. Attach your full mechanism document — the more depth, the better the ad can reference it accurately.",
    placeholder:
      "e.g., Metabolic cycling — structured eating windows that rotate high- and low-carb days across a 7-day loop. Reset the leptin/ghrelin axis older men lose after 40. Phase 1 (weeks 1-3)… Phase 2 (weeks 4-8)… Phase 3 (weeks 9-12)…",
    multiline: true,
    allowFileUpload: true,
    rows: 16,
  },
  {
    key: "proof",
    title: "Real proof you can reference (optional)",
    sub: "Client wins, case studies, testimonials, numbers — anything REAL. Leave blank if none. The ad will NEVER fabricate proof or invent client names.",
    placeholder:
      "e.g., Marcus, 48, CFO, lost 22 lbs in 11 weeks and kept it off for 8 months. Said: 'First program I didn't quit by week 4.' Or: '200+ men through this program over 3 years — avg 14 lbs lost.'",
    multiline: true,
    allowFileUpload: true,
    rows: 12,
    optional: true,
  },
  {
    key: "cta",
    title: "What do you want them to do?",
    sub: "The call to action. Concrete, immediate, low-friction.",
    placeholder: "e.g., Book a free 20-minute strategy call",
    multiline: false,
  },
  {
    key: "framework",
    title: "Pick your ad framework",
    sub: "Different frameworks work better for different audiences and offers. Pick one to generate now — you can come back and try another.",
  },
];

export function Wizard() {
  const [state, setState] = useState<WizardState>(EMPTY);
  const [stepIdx, setStepIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState<TextKey | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  const currentValue =
    step.key === "framework" ? state.framework : state[step.key];

  const canAdvance = step.optional
    ? true
    : step.key === "framework"
      ? state.framework !== null
      : typeof currentValue === "string" && currentValue.trim().length >= 2;

  function setField<K extends keyof WizardState>(k: K, v: WizardState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  function handleNext() {
    if (isLast) {
      setSubmitted(true);
      return;
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function handleBack() {
    if (submitted) {
      setSubmitted(false);
      return;
    }
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  function handleStartOver() {
    setState(EMPTY);
    setStepIdx(0);
    setSubmitted(false);
  }

  async function handleFileUpload(
    key: TextKey,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || `Upload failed (${res.status})`);
      }
      const newText = data.text as string;
      setState((s) => {
        const existing = s[key];
        const joiner = existing && existing.trim() ? "\n\n" : "";
        return { ...s, [key]: existing + joiner + newText };
      });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(null);
      // reset file input so same file can be re-uploaded if needed
      if (fileInputRefs.current[key]) {
        fileInputRefs.current[key]!.value = "";
      }
    }
  }

  if (submitted && state.framework) {
    return (
      <AdOutput
        input={{
          product: state.product.trim(),
          audience: state.audience.trim(),
          promise: state.promise.trim(),
          mechanism: state.mechanism.trim(),
          proof: state.proof.trim() || undefined,
          cta: state.cta.trim(),
          framework: state.framework,
        }}
        onStartOver={handleStartOver}
        onBack={handleBack}
      />
    );
  }

  const textValue = step.key !== "framework" ? state[step.key as TextKey] : "";
  const charCount = typeof textValue === "string" ? textValue.length : 0;

  return (
    <Card className="w-full max-w-3xl shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {stepIdx + 1} of {STEPS.length}
          </span>
          {step.optional && (
            <span className="rounded-full bg-muted px-2 py-0.5">Optional</span>
          )}
        </div>
        <Progress value={progress} className="h-1" />
        <CardTitle className="text-2xl">{step.title}</CardTitle>
        <CardDescription className="text-base">{step.sub}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {step.key === "framework" ? (
          <FrameworkPicker
            selected={state.framework}
            onSelect={(id) => setField("framework", id)}
          />
        ) : step.multiline ? (
          <div className="space-y-2">
            <Label htmlFor={step.key} className="sr-only">
              {step.title}
            </Label>
            <Textarea
              id={step.key}
              value={state[step.key as TextKey]}
              onChange={(e) =>
                setField(step.key as TextKey, e.target.value)
              }
              placeholder={step.placeholder}
              rows={step.rows ?? 10}
              autoFocus
              className="text-base font-normal leading-relaxed resize-y min-h-[12rem] max-h-[70vh]"
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {step.allowFileUpload ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[step.key] = el;
                    }}
                    type="file"
                    accept=".txt,.md,.markdown,.docx,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileUpload(step.key as TextKey, e)
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!!uploading}
                    onClick={() =>
                      fileInputRefs.current[step.key]?.click()
                    }
                  >
                    {uploading === step.key ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <Paperclip className="mr-2 h-4 w-4" />
                        Attach file
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    .txt · .md · .docx · .pdf
                  </span>
                </div>
              ) : (
                <div />
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                {charCount.toLocaleString()} chars
              </span>
            </div>
            {uploadError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={step.key} className="sr-only">
              {step.title}
            </Label>
            <Input
              id={step.key}
              value={state[step.key as TextKey]}
              onChange={(e) =>
                setField(step.key as TextKey, e.target.value)
              }
              placeholder={step.placeholder}
              autoFocus
              className="text-base"
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={stepIdx === 0}
            type="button"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canAdvance} type="button">
            {isLast ? (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate ad
              </>
            ) : (
              <>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
