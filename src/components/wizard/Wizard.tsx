"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FrameworkPicker } from "./FrameworkPicker";
import { AdOutput } from "@/components/output/AdOutput";
import type { FrameworkId } from "@/lib/prompt/frameworks";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";

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

type Step = {
  key: keyof Omit<WizardState, "framework"> | "framework";
  title: string;
  sub: string;
  placeholder?: string;
  multiline?: boolean;
  optional?: boolean;
};

const STEPS: Step[] = [
  {
    key: "product",
    title: "What is your product or offer?",
    sub: "Be specific. Name it, name the delivery format, name the duration if it has one.",
    placeholder: "e.g., 90-day online fitness coaching for men 40+ — weekly calls + custom plan",
    multiline: true,
  },
  {
    key: "audience",
    title: "Who is this for?",
    sub: "One tight sentence. Demographics + their current state or pain.",
    placeholder: "e.g., Men 40-55 who've tried every diet and nothing sticks anymore",
    multiline: true,
  },
  {
    key: "promise",
    title: "What is the big promise?",
    sub: "The outcome they get. Make it vivid and specific, not vague.",
    placeholder: "e.g., Lose 20 lbs in 90 days without giving up beer or living at the gym",
    multiline: true,
  },
  {
    key: "mechanism",
    title: "How does it work? (Your mechanism)",
    sub: "The unique thing that makes it work. Your angle, method, or process.",
    placeholder:
      "e.g., Metabolic cycling — eat more 4 days/week, less 3 days, resets fat-burning pathways older men lose",
    multiline: true,
  },
  {
    key: "proof",
    title: "Real proof you can reference (optional)",
    sub: "Client stories, results, testimonials — anything REAL. Leave blank if none. The ad will never fabricate proof.",
    placeholder:
      "e.g., Marcus, 48, lost 22 lbs in 11 weeks. Or: 'I've coached 200+ men through this program over 3 years.'",
    multiline: true,
    optional: true,
  },
  {
    key: "cta",
    title: "What do you want them to do?",
    sub: "The call to action. Concrete and immediate.",
    placeholder: "e.g., Book a free 20-minute strategy call",
  },
  {
    key: "framework",
    title: "Pick your ad framework",
    sub: "Different frameworks work better for different audiences and offers. Pick one.",
  },
];

export function Wizard() {
  const [state, setState] = useState<WizardState>(EMPTY);
  const [stepIdx, setStepIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  const currentValue =
    step.key === "framework" ? state.framework : state[step.key];

  const canAdvance = step.optional
    ? true
    : step.key === "framework"
      ? state.framework !== null
      : typeof currentValue === "string" && currentValue.trim().length >= 3;

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

  return (
    <Card className="w-full max-w-2xl shadow-sm">
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
        <CardDescription>{step.sub}</CardDescription>
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
              value={state[step.key] as string}
              onChange={(e) => setField(step.key as keyof WizardState, e.target.value)}
              placeholder={step.placeholder}
              rows={4}
              autoFocus
              className="text-base"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={step.key} className="sr-only">
              {step.title}
            </Label>
            <Input
              id={step.key}
              value={state[step.key] as string}
              onChange={(e) => setField(step.key as keyof WizardState, e.target.value)}
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
