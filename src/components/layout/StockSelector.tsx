import { useEffect, useMemo, useRef, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Search } from "lucide-react";

type SelectOption = { value: string; label: string };

export function Select({
  value,
  onValueChange,
  options,
  className = "",
  triggerClassName = "",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
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

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Search",
  className = "",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => `${option.value} ${option.label}`.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, options]);
  const displayValue = open ? query : selected?.label ?? value;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function choose(nextValue: string) {
    onValueChange(nextValue);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={rootRef} className={`relative w-full min-w-0 sm:w-auto sm:min-w-[260px] lg:min-w-[300px] lg:max-w-[420px] ${className}`}>
      <div className="flex h-11 w-full min-w-0 items-center gap-2 border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition focus-within:border-cyan-300/55 focus-within:bg-white/[0.09] hover:border-cyan-300/45 hover:bg-white/[0.09]">
        <Search className="h-4 w-4 shrink-0 text-cyan-200/70" />
        <input
          ref={inputRef}
          value={displayValue}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && filteredOptions[0]) {
              event.preventDefault();
              choose(filteredOptions[0].value);
            }
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500"
        />
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/45 transition ${open ? "rotate-180" : ""}`} />
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(420px,70vh)] overflow-hidden border border-white/10 bg-[#0b0f16]/96 shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl">
          <div className="max-h-[min(420px,70vh)] overflow-y-auto p-1.5">
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.value)}
                  className={`flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left text-sm outline-none transition hover:bg-cyan-300/10 hover:text-white ${
                    option.value === value ? "bg-cyan-300/20 text-cyan-100" : "text-white/65"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">{option.value}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-slate-500">No matching stock</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
