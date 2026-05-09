import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export function TooltipInfo({ text }: { text: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <Info className="h-4 w-4" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="max-w-xs rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600 shadow-panel" sideOffset={8}>
            {text}
            <TooltipPrimitive.Arrow className="fill-white" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
