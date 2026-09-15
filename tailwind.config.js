/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        peach: { 50: "#FFF6EE", 100: "#FFE9D6", 200: "#FFD9BC", 300: "#FFC69C" },
      },
    },
  },
  plugins: [],
};
