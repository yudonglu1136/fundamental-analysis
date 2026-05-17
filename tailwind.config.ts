import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        mist: "#eef0eb",
        line: "#d4d8d0",
        accent: "#08bfd3",
      },
      boxShadow: {
        panel: "0 18px 60px rgba(16, 20, 24, 0.08), 0 1px 0 rgba(16, 20, 24, 0.08)",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        grid: "radial-gradient(circle at 18% 0%, rgba(8,191,211,0.12), transparent 28%), linear-gradient(rgba(16,20,24,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,20,24,0.04) 1px, transparent 1px), linear-gradient(180deg, #f8f7f1 0%, #ecefe8 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
