/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        waveform: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1.1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        glow: {
          "0%, 100%": { opacity: 0.8, filter: "drop-shadow(0 0 15px rgba(168, 85, 247, 0.4))" },
          "50%": { opacity: 1, filter: "drop-shadow(0 0 25px rgba(168, 85, 247, 0.7))" },
        }
      },
      animation: {
        waveform: "waveform 1.2s ease-in-out infinite",
        glow: "glow 3s infinite ease-in-out",
      },
    },
  },
  plugins: [],
}
