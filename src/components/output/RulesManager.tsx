"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, BookOpen, X } from "lucide-react";
import { type CustomRule, deleteRule } from "@/lib/customRules";

type Props = {
  rules: CustomRule[];
  onRulesChange: (next: CustomRule[]) => void;
  disabled?: boolean;
};

/**
 * Compact "Rules (N)" chip at the top of the output page that opens an inline
 * panel listing every saved custom rule with a delete button. Nothing fancy —
 * plain list, oldest-first, so users can see the order they were added.
 */
export function RulesManager({ rules, onRulesChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        type="button"
      >
        <BookOpen className="mr-1.5 h-3 w-3" />
        {open ? "Hide" : "Rules"} ({rules.length})
      </Button>

      {open && (
        <Card className="mt-2 border-dashed">
          <CardContent className="space-y-2 p-3 text-sm">
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No saved rules yet. When you refine an ad with feedback, tick
                &quot;Also save as a universal rule&quot; to keep that feedback
                applied to every future generation.
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Applied to every generation
                </p>
                <ul className="space-y-1.5">
                  {rules.map((r, i) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-2 rounded-md border bg-background/50 px-2.5 py-1.5"
                    >
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="flex-1 whitespace-pre-wrap text-sm">
                        {r.text}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRulesChange(deleteRule(r.id))}
                        type="button"
                        aria-label="Delete rule"
                        title="Delete rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="mr-1 h-3 w-3" />
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
