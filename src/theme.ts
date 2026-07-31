import type { AppTheme } from "./types";

export const THEME_STORAGE_KEY = "norsk-kaloriapp-theme";

export type ThemeColors = {
  primary: string;
  primaryDark: string;
  background: string;
  card: string;
  soft: string;
  text: string;
  textMuted: string;
  border: string;
  white: string;
};

export const themeOrder: AppTheme[] = [
  "Classic Dark",
  "AMOLED",
  "Midnight Blue",
  "Purple Night",
  "Emerald",
  "Light",
];

export const themes: Record<AppTheme, ThemeColors> = {
  "Classic Dark": {
    primary: "#B56CFF",
    primaryDark: "#8B3DDE",
    background: "#151217",
    card: "#231E25",
    soft: "#362A31",
    text: "#FFF7FA",
    textMuted: "#C9B6BF",
    border: "#44363E",
    white: "#FFFFFF",
  },
  AMOLED: {
    primary: "#B56CFF",
    primaryDark: "#8B3DDE",
    background: "#000000",
    card: "#0E0E10",
    soft: "#17171A",
    text: "#FFFFFF",
    textMuted: "#B7B7BD",
    border: "#29292E",
    white: "#FFFFFF",
  },
  "Midnight Blue": {
    primary: "#5B8CFF",
    primaryDark: "#3464D8",
    background: "#08111F",
    card: "#111E31",
    soft: "#192A43",
    text: "#F5F8FF",
    textMuted: "#AAB9D0",
    border: "#263A58",
    white: "#FFFFFF",
  },
  "Purple Night": {
    primary: "#C06CFF",
    primaryDark: "#8E42D6",
    background: "#120B1C",
    card: "#21132F",
    soft: "#321D45",
    text: "#FFF8FF",
    textMuted: "#C9B1D8",
    border: "#49305D",
    white: "#FFFFFF",
  },
  Emerald: {
    primary: "#39D98A",
    primaryDark: "#159B5C",
    background: "#071712",
    card: "#10251E",
    soft: "#18372C",
    text: "#F3FFF9",
    textMuted: "#A8C7B9",
    border: "#28513F",
    white: "#FFFFFF",
  },
  Light: {
    primary: "#7A4FE0",
    primaryDark: "#5D35BC",
    background: "#F5F3FA",
    card: "#FFFFFF",
    soft: "#ECE7F7",
    text: "#211B2B",
    textMuted: "#6F687B",
    border: "#DED7EA",
    white: "#FFFFFF",
  },
};

export const isAppTheme = (value: unknown): value is AppTheme =>
  typeof value === "string" && themeOrder.includes(value as AppTheme);
