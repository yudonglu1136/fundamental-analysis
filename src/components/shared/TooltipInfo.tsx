import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export function TooltipInfo({ text }: { text: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/[0.08] text-cyan-100/85 shadow-[0_0_16px_rgba(34,211,238,0.1)] transition hover:border-cyan-200/45 hover:bg-cyan-300/[0.14] hover:text-white">
            <Info className="h-4 w-4" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="max-w-xs rounded-2xl border border-cyan-200/20 bg-[#070b12]/95 px-3 py-2 text-xs leading-5 text-slate-100 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl" sideOffset={8}>
            {text}
            <TooltipPrimitive.Arrow className="fill-[#070b12]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
