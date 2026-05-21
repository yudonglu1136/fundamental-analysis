type ThesisForgeLogoProps = {
  className?: string;
  showWordmark?: boolean;
};

export function ThesisForgeLogo({ className = "", showWordmark = false }: ThesisForgeLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} aria-label="Thesis Forge">
      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-cyan-200/35 bg-[#07101a] shadow-[0_0_28px_rgba(56,189,248,0.22)]">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,rgba(125,249,255,0.38),transparent_34%),linear-gradient(135deg,rgba(14,165,233,0.18),rgba(139,92,246,0.2)_58%,rgba(45,212,191,0.18))]" />
        <svg viewBox="0 0 44 44" className="relative h-8 w-8" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="tf-logo-edge" x1="6" x2="38" y1="6" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7DF9FF" />
              <stop offset="0.52" stopColor="#38BDF8" />
              <stop offset="1" stopColor="#A78BFA" />
            </linearGradient>
            <filter id="tf-logo-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M8 22 22 8l14 14-14 14L8 22Z" fill="rgba(2,6,23,0.62)" stroke="url(#tf-logo-edge)" strokeWidth="1.7" />
          <path d="M14 17.5h16M22 17.5v16M15.5 32.5h13" fill="none" stroke="#F8FAFC" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" filter="url(#tf-logo-glow)" />
          <path d="M30 12.5 33 9.5 36 12.5 33 15.5 30 12.5Z" fill="#7DF9FF" opacity="0.9" />
          <circle cx="13" cy="29" r="1.8" fill="#A78BFA" opacity="0.95" />
        </svg>
      </span>
      {showWordmark ? (
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-normal text-white">Thesis Forge</span>
          <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-cyan-200/60">Research OS</span>
        </span>
      ) : null}
    </span>
  );
}
