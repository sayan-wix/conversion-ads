"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type Props = {
  /** Which block this feedback applies to — only used for the placeholder copy. */
  target: "ad" | "headlines";
  /** True while a revise request is in flight. */
  busy: boolean;
  /** Parent disables the box during ANY streaming, not just revise. */
  disabled: boolean;
  /** Called when the user clicks Apply. Parent runs the revise request. */
  onApply: (feedback: string, saveAsRule: boolean) => void;
};

/**
 * Collapsible feedback input below each output card. User types a note
 * (e.g. "make the opening sharper", "third paragraph should be first person")
 * and clicks Apply. They can also tick "save as a universal rule" to have
 * the note stored in localStorage and applied to every future generation.
 */
export function FeedbackBox({ target, busy, disabled, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(false);

  function handleApply() {
    if (!text.trim() || disabled) return;
    onApply(text.trim(), saveAsRule);
    // Keep the text around in case revise fails so they can retry.
  }

  const placeholder =
    target === "ad"
      ? "e.g. The third paragraph talks about Eric in third person — the ad is written BY Eric, keep it first person throughout."
      : "e.g. Headlines 11-15 sound too corporate — make them punchier and more conversational.";

  return (
    <div className="border-t pt-3">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs -ml-2"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled && !busy}
        type="button"
      >
        <Wand2 className="mr-1.5 h-3 w-3" />
        Refine with feedback
        {open ? (
          <ChevronUp className="ml-1 h-3 w-3" />
        ) : (
          <ChevronDown className="ml-1 h-3 w-3" />
        )}
      </Button>

      {open && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={busy}
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsRule}
                onChange={(e) => setSaveAsRule(e.target.checked)}
                disabled={busy}
                className="mt-0.5"
              />
              <span>
                Also save as a universal rule for all future ads and headlines
              </span>
            </label>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={busy || disabled || !text.trim()}
              type="button"
              className="h-8"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-3 w-3" />
                  Apply change
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
