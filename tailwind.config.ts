import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Report design-system tokens (mirrors :root vars in src/lib/reports/html-report.ts)
        ink: {
          DEFAULT: "#0B2545",
          soft: "#46586C",
          faint: "#8A98A8",
        },
        teal: {
          400: "#3FD9CC",
          500: "#1FC6B8",
          600: "#1AAEAC",
          700: "#11888B",
        },
        rule: "#DCE3E8",
        navy: {
          DEFAULT: "#1E3A5F",
          50: "#EBF0F7",
          100: "#C8D7EA",
          200: "#A5BEDC",
          300: "#82A5CF",
          400: "#5F8CC1",
          500: "#3C73B3",
          600: "#1E3A5F",
          700: "#172D4A",
          800: "#101F34",
          900: "#08101F",
        },
        status: {
          "not-started": "#94A3B8",
          "on-track": "#3B82F6",
          completed: "#22C55E",
          delayed: "#EF4444",
          overdue: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 6px 18px rgba(11,37,69,.05)",
      },
    },
  },
  plugins: [],
};

export default config;
