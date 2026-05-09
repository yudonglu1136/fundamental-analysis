import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14223a",
        mist: "#f4f7fb",
        line: "#d9e2ef",
      },
      boxShadow: {
        panel: "0 8px 28px rgba(15, 23, 42, 0.08)",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        grid: "radial-gradient(circle at top left, rgba(20,34,58,0.06), transparent 36%), linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
