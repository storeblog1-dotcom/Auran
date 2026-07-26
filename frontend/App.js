import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

function AppInner() {
  const { colors } = useTheme();

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      let fontLink = document.getElementById("open-source-pretendard");
      if (!fontLink) {
        fontLink = document.createElement("link");
        fontLink.id = "open-source-pretendard";
        fontLink.rel = "stylesheet";
        fontLink.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css";
        document.head.appendChild(fontLink);
      }
      const styleEl = document.createElement("style");
      styleEl.innerHTML = `
        body, button, input, textarea, select {
          font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", Roboto, sans-serif !important;
          letter-spacing: -0.25px;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  return (
    <>
      <StatusBar style={colors.statusBarStyle} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

