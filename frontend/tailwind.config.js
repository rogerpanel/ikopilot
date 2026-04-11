/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#F97316",
          blue: "#3B82F6",
        },
        dark: {
          900: "#0a0e1a",
          800: "#111827",
          700: "#1a2035",
          600: "#1f2937",
          500: "#374151",
          400: "#4b5563",
        },
      },
    },
  },
  plugins: [],
};
