/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        idayal: {
          green: "#3B7DD8",
          "green-soft": "#E6EFFB",
          "green-dark": "#2C5FA8",
          orange: "#F08A1B",
          "orange-soft": "#FFF1DC",
          blue: "#3B7DD8",
          "blue-soft": "#E6EFFB",
          "blue-dark": "#2C5FA8",
          /*
           * Le bleu de marque perd sa lisibilité sur fond sombre : sur #0A0E14 il
           * tombe sous le seuil de contraste du texte. Cette variante éclaircie le
           * remplace partout où du bleu porte de l'information dans le thème sombre.
           */
          "blue-light": "#74A8EC",
          bg: "#F4F5F7",
          "bg-elev": "#FFFFFF",
          /*
           * Un fond d'encre, pas un gris retourné. L'ancien #0F1020 tirait sur le
           * violet et restait clair : les lignes de texte s'y écrasaient au lieu d'y
           * flotter.
           */
          "bg-dark": "#0A0E14",
          "bg-dark-elev": "#141A23",
          text: "#1A1E22",
          "text-secondary": "#5A6573",
          "text-muted": "#8C95A1",
          border: "rgba(15, 16, 32, 0.07)",
          /*
           * À peine visible, volontairement : dans le noir, une séparation marquée
           * redécoupe l'écran en cases et annule le bénéfice d'avoir retiré les cartes.
           */
          "border-dark": "rgba(255, 255, 255, 0.07)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          '"SF Pro Text"',
          '"Segoe UI"',
          "Roboto",
          "system-ui",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightish: "-0.012em",
        tight2: "-0.02em",
      },
      borderRadius: {
        row: "14px",
        bar: "22px",
        card: "24px",
        phone: "32px",
      },
      maxWidth: {
        phone: "430px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 16, 32, 0.04), 0 4px 12px rgba(15, 16, 32, 0.04)",
        elev: "0 2px 6px rgba(15, 16, 32, 0.06), 0 12px 28px rgba(15, 16, 32, 0.08)",
        bar: "0 6px 24px rgba(15, 16, 32, 0.10), 0 1px 2px rgba(15, 16, 32, 0.04)",
        card: "0 20px 50px -10px rgba(15, 16, 32, 0.20), 0 6px 16px -6px rgba(15, 16, 32, 0.12)",
      },
      keyframes: {
        slideInUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideOutRight: {
          "0%": {
            transform: "translateX(0)",
            opacity: "1",
            maxHeight: "120px",
          },
          "60%": {
            transform: "translateX(120%)",
            opacity: "0",
            maxHeight: "120px",
          },
          "100%": {
            transform: "translateX(120%)",
            opacity: "0",
            maxHeight: "0px",
            marginBottom: "0",
            paddingTop: "0",
            paddingBottom: "0",
          },
        },
        checkPop: {
          "0%": { transform: "scale(0)" },
          "70%": { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        bounceIn: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "slide-in-up": "slideInUp 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-out-right":
          "slideOutRight 0.32s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards",
        "check-pop": "checkPop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "fade-in": "fadeIn 0.25s ease-out",
        "bounce-in": "bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        shimmer: "shimmer 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
