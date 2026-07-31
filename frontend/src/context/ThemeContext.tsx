import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeColors, darkTheme, lightTheme } from "../theme/colors";

type ThemeMode = "dark" | "light";

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

const THEME_STORAGE_KEY = "user_theme_mode";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    const loadStoredTheme = async () => {
      try {
        const storedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedMode === "light" || storedMode === "dark") {
          setThemeState(storedMode);
        }
      } catch (e) {
        console.log("Failed to load theme preference", e);
      }
    };
    loadStoredTheme();
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (e) {
      console.log("Failed to save theme preference", e);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const nextMode = theme === "dark" ? "light" : "dark";
    void setThemeMode(nextMode);
  }, [theme, setThemeMode]);

  const colors = theme === "dark" ? darkTheme : lightTheme;
  const isDark = theme === "dark";

  const value = useMemo(
    () => ({
      theme,
      colors,
      isDark,
      toggleTheme,
      setThemeMode,
    }),
    [theme, colors, isDark, toggleTheme, setThemeMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
