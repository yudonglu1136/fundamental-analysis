import { useState, type CSSProperties } from "react";
import { getCompanyLogoUrl, logoFallbackText, themeForSymbol } from "./companyLogos";

type StockResearchMarkProps = {
  ticker: string;
  name: string;
  sector?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES = {
  sm: "h-10 w-10 rounded-xl text-xs",
  md: "h-14 w-14 rounded-2xl text-sm",
  lg: "h-20 w-20 rounded-[1.4rem] text-base sm:h-24 sm:w-24",
};

const TILE_CLASSES = {
  sm: "inset-1 rounded-lg",
  md: "inset-1.5 rounded-xl",
  lg: "inset-2 rounded-2xl",
};

const IMAGE_CLASSES = {
  sm: "h-[78%] w-[78%] rounded-md p-0.5",
  md: "h-[78%] w-[78%] rounded-lg p-1",
  lg: "h-[78%] w-[78%] rounded-xl p-1.5",
};

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function StockResearchMark({ ticker, name, size = "md", className = "" }: StockResearchMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const theme = themeForSymbol(ticker);
  const logoUrl = getCompanyLogoUrl(ticker);
  const fallback = logoFallbackText(ticker);
  const style = {
    background: theme.logoBackground,
    borderColor: `${theme.color}99`,
    color: theme.logoText,
    boxShadow: `0 0 0 1px ${hexToRgba(theme.color, 0.2)}, 0 18px 48px ${hexToRgba(theme.color, 0.22)}, inset 0 1px 0 rgba(255,255,255,0.16)`,
  } satisfies CSSProperties;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border font-semibold shadow-[0_16px_40px_rgba(0,0,0,0.24)] ${SIZE_CLASSES[size]} ${className}`}
      style={style}
      aria-label={`${name} logo`}
      title={`${ticker} · ${name}`}
    >
      <span className={`absolute flex items-center justify-center px-1 text-center leading-none ${TILE_CLASSES[size]}`} style={{ background: theme.logoTile }}>
        {fallback}
      </span>
      {logoUrl && !logoFailed ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className={`relative object-contain ${IMAGE_CLASSES[size]}`}
          style={{ background: theme.logoTile }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setLogoFailed(true)}
        />
      ) : null}
    </span>
  );
}
