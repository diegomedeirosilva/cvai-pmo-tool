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
    },
  },
  plugins: [],
};

export default config;
