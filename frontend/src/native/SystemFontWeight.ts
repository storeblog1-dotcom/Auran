import { AppState, NativeModules, Platform } from "react-native";
import { useCallback, useEffect, useState } from "react";

type SystemFontWeightResult = {
  isBoldTextEnabled: boolean;
};

type SystemFontWeightNativeModule = {
  getSystemFontWeight: () => Promise<SystemFontWeightResult>;
};

const systemFontWeightModule = NativeModules.SystemFontWeightModule as
  | SystemFontWeightNativeModule
  | undefined;

export function useSystemBoldText() {
  const [isBoldTextEnabled, setIsBoldTextEnabled] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS !== "android" || !systemFontWeightModule) {
      setIsBoldTextEnabled(false);
      return;
    }

    try {
      const result = await systemFontWeightModule.getSystemFontWeight();
      setIsBoldTextEnabled(result.isBoldTextEnabled);
    } catch {
      setIsBoldTextEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void refresh();
      }
    });

    return () => subscription.remove();
  }, [refresh]);

  return isBoldTextEnabled;
}
