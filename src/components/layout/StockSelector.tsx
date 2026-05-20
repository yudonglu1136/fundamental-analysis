import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

export function Select({
  value,
  onValueChange,
  options,
  className = "",
  triggerClassName = "",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={`inline-flex h-12 w-full min-w-0 items-center justify-between gap-3 border border-white/70 bg-white/85 px-3 text-left text-sm font-semibold text-ink shadow-panel transition hover:border-accent/40 hover:bg-white sm:w-auto sm:min-w-[220px] lg:min-w-[240px] lg:max-w-[360px] ${className} ${triggerClassName}`}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink/45" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={8}
          className="z-50 max-h-[min(420px,70vh)] w-[var(--radix-select-trigger-width)] min-w-[260px] overflow-hidden border border-white/70 bg-white/95 shadow-panel backdrop-blur-xl"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="cursor-pointer px-3 py-2.5 text-sm text-ink/65 outline-none transition hover:bg-[#101418] hover:text-white data-[state=checked]:bg-[#101418] data-[state=checked]:text-white"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
