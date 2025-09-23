import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "card-background": {
          DEFAULT: "hsl(var(--card-background))",
        },
        "gray-1": {
          DEFAULT: "hsl(var(--gray-1))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        pending: "hsl(var(--pending))",
        active: "hsl(var(--active))",
        succeeded: "hsl(var(--succeeded))",
        executed: "hsl(var(--executed))",
        defeated: "hsl(var(--defeated))",
        canceled: "hsl(var(--canceled))",
        "always-light": "hsl(var(--always-light))",
        "always-dark": "hsl(var(--always-dark))",
        // Custom semantic colors
        light: "hsl(var(--light))",
        dark: "hsl(var(--dark))",
        "grey-1": "hsl(var(--grey-1))",
        "grey-2": "hsl(var(--grey-2))",
        bg: "hsl(var(--bg))",
        "bg-2": "hsl(var(--bg-2))",
        blue: "hsl(var(--blue))",
        green: "hsl(var(--green))",
        red: "hsl(var(--red))",
        yellow: "hsl(var(--yellow))",
        purple: "hsl(var(--purple))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "var(--card-shadow)",
      },
    },
  },
  safelist: [
    "bg-pending/10",
    "text-pending",
    "bg-active/10",
    "text-active",
    "bg-canceled/10",
    "text-canceled",
    "bg-defeated/10",
    "text-defeated",
    "bg-succeeded/10",
    "text-succeeded",
    "bg-executed/10",
    "text-executed",
    "dark-blue",
    "dark-red",
    "dark-green",
    "light-pink",
    "light-green",
    "dark-purple",
    "bg-warning",
    "bg-success",
    "bg-danger",
  ],
  plugins: [typography, animate],
} satisfies Config;
