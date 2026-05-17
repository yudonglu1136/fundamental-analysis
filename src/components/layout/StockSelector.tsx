import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

export function Select({
  value,
  onValueChange,
  options,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger className="inline-flex min-w-[240px] max-w-[360px] items-center justify-between gap-3 border border-white/70 bg-white/80 px-3 py-2 text-sm font-semibold text-ink shadow-panel transition hover:border-accent/40 hover:bg-white">
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink/45" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 max-h-[420px] overflow-hidden border border-white/70 bg-white/95 shadow-panel backdrop-blur-xl">
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} className="cursor-pointer px-3 py-2 text-sm text-ink/65 outline-none transition hover:bg-[#101418] hover:text-white data-[state=checked]:bg-[#101418] data-[state=checked]:text-white">
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
