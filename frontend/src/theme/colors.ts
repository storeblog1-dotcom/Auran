export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgInput: string;
  borderColor: string;
  borderLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentBlue: string;
  accentPurple: string;
  accentPink: string;
  accentCyan: string;
  auraGradient: readonly [string, string, ...string[]];
  tabBarBg: string;
  headerBg: string;
  modalBg: string;
  chatBubbleSelf: string;
  chatBubbleOther: string;
  statusBarStyle: "light" | "dark";
}

export const darkTheme: ThemeColors = {
  bgPrimary: "#0f0f13",
  bgSecondary: "#18181f",
  bgCard: "#18181f",
  bgInput: "#22222c",
  borderColor: "#2d2d3a",
  borderLight: "#3d3d4e",
  textPrimary: "#ffffff",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  accentBlue: "#8b5cf6",
  accentPurple: "#8b5cf6",
  accentPink: "#ec4899",
  accentCyan: "#06b6d4",
  auraGradient: ["#8b5cf6", "#ec4899", "#06b6d4"],
  tabBarBg: "#121218",
  headerBg: "#0f0f13",
  modalBg: "#18181f",
  chatBubbleSelf: "#8b5cf6",
  chatBubbleOther: "#22222c",
  statusBarStyle: "light",
};

export const lightTheme: ThemeColors = {
  bgPrimary: "#fcfaff",
  bgSecondary: "#ffffff",
  bgCard: "#ffffff",
  bgInput: "#f5f1ff",
  borderColor: "#e8e0f5",
  borderLight: "#f1ebfa",
  textPrimary: "#17152e",
  textSecondary: "#625d78",
  textMuted: "#9a94b2",
  accentBlue: "#7c5ce8",
  accentPurple: "#7652df",
  accentPink: "#ec4899",
  accentCyan: "#42b8d4",
  auraGradient: ["#7652df", "#ec6db1", "#42b8d4"],
  tabBarBg: "#ffffff",
  headerBg: "#ffffff",
  modalBg: "#ffffff",
  chatBubbleSelf: "#7652df",
  chatBubbleOther: "#f0ebfa",
  statusBarStyle: "dark",
};
