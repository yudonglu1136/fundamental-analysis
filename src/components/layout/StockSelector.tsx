import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Search } from "lucide-react";

type SelectOption = { value: string; label: string };

type MobilePanelMetrics = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

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
          <SelectPrimitive.Viewport className="max-h-[min(420px,70vh)] overflow-y-auto p-1.5">
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
  const [mobilePanelMetrics, setMobilePanelMetrics] = useState<MobilePanelMetrics | null>(null);
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

  useLayoutEffect(() => {
    if (!open) {
      setMobilePanelMetrics(null);
      return;
    }

    function updateMobilePanelMetrics() {
      if (typeof window === "undefined" || !rootRef.current) return;
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (!isMobile) {
        setMobilePanelMetrics(null);
        return;
      }

      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const rect = rootRef.current.getBoundingClientRect();
      const sideInset = 12;
      const top = Math.max(viewportOffsetTop + 8, rect.bottom + 8);
      const maxHeight = Math.max(168, viewportHeight + viewportOffsetTop - top - 12);
      setMobilePanelMetrics({
        top,
        left: sideInset,
        width: Math.max(280, window.innerWidth - sideInset * 2),
        maxHeight,
      });
    }

    updateMobilePanelMetrics();
    const frame = window.requestAnimationFrame(updateMobilePanelMetrics);
    window.addEventListener("resize", updateMobilePanelMetrics);
    window.addEventListener("scroll", updateMobilePanelMetrics, true);
    window.visualViewport?.addEventListener("resize", updateMobilePanelMetrics);
    window.visualViewport?.addEventListener("scroll", updateMobilePanelMetrics);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMobilePanelMetrics);
      window.removeEventListener("scroll", updateMobilePanelMetrics, true);
      window.visualViewport?.removeEventListener("resize", updateMobilePanelMetrics);
      window.visualViewport?.removeEventListener("scroll", updateMobilePanelMetrics);
    };
  }, [open]);

  function choose(nextValue: string) {
    onValueChange(nextValue);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function nextSearchQuery(rawValue: string) {
    if (!open || !selected?.label) return rawValue;
    if (!rawValue.startsWith(selected.label)) return rawValue;
    return rawValue.slice(selected.label.length).trimStart();
  }

  function openSearch() {
    if (!open) {
      setOpen(true);
      setQuery("");
    }
    window.requestAnimationFrame(() => inputRef.current?.select());
  }

  return (
    <div ref={rootRef} className={`relative z-30 w-full min-w-0 sm:w-auto sm:min-w-[260px] lg:min-w-[300px] lg:max-w-[420px] ${className}`}>
      <div
        onPointerDown={openSearch}
        className="flex h-11 w-full min-w-0 items-center gap-2 border border-white/10 bg-[#0b0f16] px-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition focus-within:border-cyan-300/55 focus-within:bg-[#101722] hover:border-cyan-300/45 hover:bg-[#101722] sm:bg-white/[0.06] sm:focus-within:bg-white/[0.09] sm:hover:bg-white/[0.09]"
      >
        <Search className="h-4 w-4 shrink-0 text-cyan-200/70" />
        <input
          ref={inputRef}
          value={displayValue}
          onFocus={() => {
            openSearch();
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(nextSearchQuery(event.target.value));
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
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500"
        />
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/45 transition ${open ? "rotate-180" : ""}`} />
      </div>

      {open ? (
        <div
          className="fixed z-[70] overflow-hidden border border-cyan-200/20 bg-[#070b12] shadow-[0_28px_80px_rgba(0,0,0,0.62)] sm:absolute sm:left-0 sm:right-0 sm:top-[calc(100%+0.5rem)] sm:max-h-[min(420px,70vh)] sm:border-white/10 sm:bg-[#0b0f16] sm:shadow-[0_24px_70px_rgba(0,0,0,0.44)] sm:backdrop-blur-xl"
          style={
            mobilePanelMetrics
              ? {
                  left: mobilePanelMetrics.left,
                  top: mobilePanelMetrics.top,
                  width: mobilePanelMetrics.width,
                  maxHeight: mobilePanelMetrics.maxHeight,
                }
              : undefined
          }
        >
          <div
            className="max-h-[min(420px,70vh)] overflow-y-auto p-1.5"
            style={mobilePanelMetrics ? { maxHeight: mobilePanelMetrics.maxHeight } : undefined}
          >
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.value)}
                  className={`flex w-full min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3 text-left text-sm outline-none transition last:border-b-0 hover:bg-cyan-300/10 hover:text-white sm:py-2.5 ${
                    option.value === value ? "bg-cyan-300/20 text-cyan-100" : "text-white/72"
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
