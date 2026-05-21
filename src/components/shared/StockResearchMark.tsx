import { useId, type CSSProperties } from "react";

type StockResearchMarkProps = {
  ticker: string;
  name: string;
  sector?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

type StockMarkPalette = {
  accent: string;
  secondary: string;
  tertiary: string;
};

const SIZE_CLASSES = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-20 w-20 rounded-[1.4rem] sm:h-24 sm:w-24",
};

const FONT_SIZE = {
  sm: 22,
  md: 24,
  lg: 26,
};

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function paletteFor(ticker: string, sector = ""): StockMarkPalette {
  const context = `${ticker} ${sector}`.toLowerCase();

  if (/defense|aero|autonomy|drone|munition|space|cyber/.test(context)) {
    return { accent: "#67e8f9", secondary: "#fbbf24", tertiary: "#a78bfa" };
  }

  if (/pharma|bio|health|medical|disease|oncology|therapeutic/.test(context)) {
    return { accent: "#8b5cf6", secondary: "#5eead4", tertiary: "#38bdf8" };
  }

  if (/semi|chip|ai|cloud|software|network|compute|memory|data/.test(context)) {
    return { accent: "#38bdf8", secondary: "#6366f1", tertiary: "#22d3ee" };
  }

  if (/bank|financial|payment|insurance|exchange|broker|credit/.test(context)) {
    return { accent: "#60a5fa", secondary: "#34d399", tertiary: "#facc15" };
  }

  if (/energy|power|nuclear|gas|utility|renewable/.test(context)) {
    return { accent: "#a3e635", secondary: "#22d3ee", tertiary: "#60a5fa" };
  }

  if (/consumer|retail|auto|ev|beverage|restaurant|luxury/.test(context)) {
    return { accent: "#f0abfc", secondary: "#38bdf8", tertiary: "#fbbf24" };
  }

  return { accent: "#67e8f9", secondary: "#60a5fa", tertiary: "#a78bfa" };
}

function initialsFor(ticker: string) {
  return ticker.replace(/[^A-Z0-9.]/gi, "").replace(".", "").slice(0, 4).toUpperCase();
}

export function StockResearchMark({ ticker, name, sector, size = "md", className = "" }: StockResearchMarkProps) {
  const reactId = useId().replace(/:/g, "");
  const safeTicker = initialsFor(ticker);
  const palette = paletteFor(ticker, sector);
  const gradientId = `stock-mark-${safeTicker}-${reactId}`;
  const glow = hexToRgba(palette.accent, 0.28);
  const style = {
    boxShadow: `0 0 0 1px ${hexToRgba(palette.accent, 0.34)}, 0 18px 48px ${glow}, inset 0 1px 0 rgba(255,255,255,0.16)`,
  } satisfies CSSProperties;

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-white/15 bg-[#060a12] ${SIZE_CLASSES[size]} ${className}`}
      style={style}
      aria-label={`${name} research mark`}
      title={`${ticker} · ${name}`}
    >
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true" className="h-full w-full">
        <defs>
          <linearGradient id={`${gradientId}-bg`} x1="10" x2="90" y1="0" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.accent} stopOpacity="0.38" />
            <stop offset="48%" stopColor={palette.secondary} stopOpacity="0.18" />
            <stop offset="100%" stopColor={palette.tertiary} stopOpacity="0.34" />
          </linearGradient>
          <radialGradient id={`${gradientId}-orb`} cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="55%" stopColor={palette.accent} stopOpacity="0.08" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" rx="24" fill={`url(#${gradientId}-bg)`} />
        <rect x="8" y="8" width="84" height="84" rx="20" fill="rgba(2, 6, 23, 0.62)" stroke="rgba(255,255,255,0.12)" />
        <path d="M18 72 50 18 82 72 50 58Z" fill={`url(#${gradientId}-orb)`} stroke={palette.accent} strokeOpacity="0.55" strokeWidth="1.8" />
        <path d="M27 73h46M35 57h30M42 42h16" stroke={palette.secondary} strokeOpacity="0.54" strokeWidth="2.1" strokeLinecap="round" />
        <circle cx="27" cy="73" r="2.6" fill={palette.accent} fillOpacity="0.85" />
        <circle cx="73" cy="73" r="2.6" fill={palette.secondary} fillOpacity="0.85" />
        <text
          x="50"
          y="55"
          fill="#ffffff"
          fontFamily="IBM Plex Sans, Inter, system-ui, sans-serif"
          fontSize={FONT_SIZE[size]}
          fontWeight="800"
          letterSpacing="1.6"
          textAnchor="middle"
          dominantBaseline="middle"
          paintOrder="stroke"
          stroke="rgba(2, 6, 23, 0.82)"
          strokeWidth="3"
        >
          {safeTicker}
        </text>
      </svg>
      <span
        className="pointer-events-none absolute inset-x-2 bottom-2 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)` }}
      />
    </div>
  );
}
