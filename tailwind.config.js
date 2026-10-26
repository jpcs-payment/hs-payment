/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#07162a",
          900: "#0B1F3A",
          800: "#163A63",
          700: "#245486",
        },
        ink: "#17243a",
        mist: "#F4F7FB",
        line: "#e4eaf2",
        mint: "#0e9f78",
        amber: "#c47b10",
        coral: "#d05252",
      },
      boxShadow: {
        soft: "0 12px 30px rgba(11, 31, 58, 0.07)",
        float: "0 20px 50px rgba(11, 31, 58, 0.12)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
        heading: ["var(--font-geist-sans)"],
      },
    },
  },
  plugins: [],
};
