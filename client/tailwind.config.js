/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand palette — electric blue (static; reads on both themes)
        brand: {
          50: "#eef2ff",
          100: "#dbe2ff",
          200: "#b8c4ff",
          300: "#8a9bff",
          400: "#5e6fff",
          500: "#3849f5",
          600: "#2b37cf",
          700: "#222ba3",
          800: "#1a2080",
          900: "#141863",
        },
        // Premium accent (purple) for the dark theme
        grape: {
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
        // Semantic, theme-aware tokens backed by CSS variables.
        // The `ink` ramp INVERTS in dark mode so existing utility classes
        // (text-ink-800, bg-ink-50, border-ink-100 …) keep working both ways.
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
        },
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        accent: {
          DEFAULT: "#ff8c42",
          soft: "#ffb98a",
        },
        // Marketing + auth palette, sampled directly from the official Bizzrow logo
        // (navy #080f21, azure #1a74f9). Static hex — these pages are always dark.
        navy: {
          950: "#04070f",
          900: "#070c1a",
          850: "#0a1122",
          800: "#0d1628",
          700: "#131f38",
          600: "#1b2a49",
          500: "#24375f",
        },
        azure: {
          200: "#bcd6ff",
          300: "#8fbaff",
          400: "#5a9bff",
          500: "#1a74f9",
          600: "#0b5ed9",
          700: "#0a4bac",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial"],
        display: ["'Plus Jakarta Sans'", "Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(15, 23, 42, 0.10)",
        card: "0 1px 3px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)",
        glow: "0 10px 40px -12px rgba(56, 73, 245, 0.45)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #3849f5 0%, #6b5af0 50%, #8b5cf6 100%)",
        "gradient-azure": "linear-gradient(135deg, #1a74f9 0%, #3d8bff 100%)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
        riseIn: "riseIn 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};
