import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1f4e79",
          light: "#e8f0f8",
        },
        gold: "#b7860b",
      },
    },
  },
  plugins: [],
};

export default config;