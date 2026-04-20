"use client";

import { Card } from "@/components/ui/card";
import { FRAMEWORKS, type FrameworkId } from "@/lib/prompt/frameworks";
import { Check } from "lucide-react";

type Props = {
  selected: FrameworkId | null;
  onSelect: (id: FrameworkId) => void;
};

export function FrameworkPicker({ selected, onSelect }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.values(FRAMEWORKS).map((f) => {
        const active = selected === f.id;
        return (
          <Card
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`relative cursor-pointer p-4 transition-all hover:border-foreground/30 ${
              active ? "border-foreground ring-2 ring-foreground/10" : ""
            }`}
          >
            {active && (
              <div className="absolute right-3 top-3">
                <Check className="h-4 w-4" />
              </div>
            )}
            <div className="pr-6">
              <div className="font-semibold">{f.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {f.tagline}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Best for:</span> {f.bestFor}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium">Length:</span> {f.lengthHint}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
