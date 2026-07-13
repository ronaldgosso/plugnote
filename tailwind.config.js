/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
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
        zinc: {
          750: "#3a3a44",
          850: "#1e1e23",
          950: "#09090b",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.4)",
        "inner-glow-violet": "inset 0 1px 0 rgba(139,92,246,0.15), inset 0 -1px 0 rgba(0,0,0,0.5)",
        "record": "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
        "tactile": "0 1px 0 rgba(255,255,255,0.08), 0 -1px 0 rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)",
        "tactile-pressed": "inset 0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(0,0,0,0.3)",
        "neon-violet": "0 0 20px rgba(139,92,246,0.4), 0 0 60px rgba(139,92,246,0.15)",
        "neon-sm": "0 0 8px rgba(139,92,246,0.5)",
        "float": "0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)",
        "card-lift": "0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
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
          "0%, 100%": { opacity: "0.8", filter: "drop-shadow(0 0 15px rgba(168, 85, 247, 0.4))" },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 25px rgba(168, 85, 247, 0.7))" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "record-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "eq-bounce-1": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        "eq-bounce-2": {
          "0%, 100%": { transform: "scaleY(0.6)" },
          "40%": { transform: "scaleY(1)" },
        },
        "eq-bounce-3": {
          "0%, 100%": { transform: "scaleY(0.2)" },
          "60%": { transform: "scaleY(0.9)" },
        },
        "cursor-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "slide-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        marquee: {
          from: { transform: "translateX(0%)" },
          to: { transform: "translateX(-50%)" },
        },
        "pulse-neon": {
          "0%, 100%": { boxShadow: "0 0 6px rgba(139,92,246,0.4)" },
          "50%": { boxShadow: "0 0 20px rgba(139,92,246,0.8), 0 0 40px rgba(139,92,246,0.3)" },
        },
      },
      animation: {
        waveform: "waveform 1.2s ease-in-out infinite",
        glow: "glow 3s infinite ease-in-out",
        float: "float 4s ease-in-out infinite",
        "record-spin": "record-spin 8s linear infinite",
        "record-spin-slow": "record-spin 20s linear infinite",
        "eq-1": "eq-bounce-1 0.8s ease-in-out infinite",
        "eq-2": "eq-bounce-2 0.9s ease-in-out infinite 0.15s",
        "eq-3": "eq-bounce-3 0.7s ease-in-out infinite 0.3s",
        "cursor-blink": "cursor-blink 1.1s step-start infinite",
        "slide-in-up": "slide-in-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        marquee: "marquee 10s linear infinite",
        "pulse-neon": "pulse-neon 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
