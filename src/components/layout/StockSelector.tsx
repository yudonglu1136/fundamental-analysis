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
        className={`inline-flex h-11 w-full min-w-0 items-center justify-between gap-3 border border-white/10 bg-white/[0.06] px-3 text-left text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition hover:border-cyan-300/45 hover:bg-white/[0.09] sm:w-auto sm:min-w-[220px] lg:min-w-[240px] lg:max-w-[360px] ${className} ${triggerClassName}`}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-white/45" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={8}
          className="z-50 max-h-[min(420px,70vh)] w-[var(--radix-select-trigger-width)] min-w-[260px] overflow-hidden border border-white/10 bg-[#0b0f16]/95 shadow-[0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="cursor-pointer px-3 py-2.5 text-sm text-white/65 outline-none transition hover:bg-cyan-300/10 hover:text-white data-[state=checked]:bg-cyan-300/20 data-[state=checked]:text-cyan-100"
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
