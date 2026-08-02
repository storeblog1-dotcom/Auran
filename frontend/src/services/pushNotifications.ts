import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import api from "./api";

const INSTALLATION_ID_KEY = "auran_push_installation_id";
const EXPO_PUSH_TOKEN_KEY = "auran_expo_push_token";

export type PushRegistrationState =
  | "registered"
  | "permission-denied"
  | "unsupported"
  | "unavailable";

export interface PushRegistrationResult {
  state: PushRegistrationState;
  reason?: string;
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function createInstallationId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `auran-${Date.now().toString(36)}-${random}`;
}

export async function getPushInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const installationId = createInstallationId();
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, installationId);
  return installationId;
}

function isAndroidExpoGo(): boolean {
  if (Platform.OS !== "android") return false;
  const executionEnvironment = (Constants as unknown as {
    executionEnvironment?: string;
  }).executionEnvironment;
  return (
    executionEnvironment === "storeClient"
    || Constants.appOwnership === "expo"
  );
}

function getEasProjectId(): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return expoExtra?.eas?.projectId || Constants.easConfig?.projectId;
}

async function saveTokenOnServer(expoPushToken: string): Promise<void> {
  const deviceId = await getPushInstallationId();
  await api.post("/notifications/push-tokens", {
    expo_push_token: expoPushToken,
    device_id: deviceId,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version,
  });
  await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, expoPushToken);

  api.post("/notifications/push-tokens/sync-receipts").catch(() => undefined);
}

export async function registerCurrentInstallationForPush():
  Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { state: "unsupported", reason: "web" };
  }

  if (isAndroidExpoGo()) {
    return { state: "unsupported", reason: "android-expo-go" };
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let permission = existingPermission.status;
  if (permission !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    permission = requested.status;
  }
  if (permission !== "granted") {
    return { state: "permission-denied" };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    return { state: "unavailable", reason: "missing-eas-project-id" };
  }

  try {
    const expoPushToken = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    await saveTokenOnServer(expoPushToken);
    return { state: "registered" };
  } catch {
    return { state: "unavailable", reason: "token-registration-failed" };
  }
}

export async function deactivateCurrentInstallationPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  const deviceId = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  try {
    if (deviceId) {
      await api.delete(
        `/notifications/push-tokens/${encodeURIComponent(deviceId)}`,
        { timeout: 2500 },
      );
    }
  } finally {
    await AsyncStorage.removeItem(EXPO_PUSH_TOKEN_KEY);
    try {
      await Notifications.unregisterForNotificationsAsync();
    } catch {
      // Some development clients do not expose remote registration.
    }
  }
}

export function startPushNotificationListeners(
  onTokenRolled: () => void,
  onNotificationResponse: (data: Record<string, unknown>) => void,
): () => void {
  if (Platform.OS === "web") return () => undefined;

  const tokenSubscription = Notifications.addPushTokenListener(() => {
    onTokenRolled();
  });
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      onNotificationResponse(
        response.notification.request.content.data as Record<string, unknown>,
      );
    },
  );
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      onNotificationResponse(
        response.notification.request.content.data as Record<string, unknown>,
      );
      void Notifications.clearLastNotificationResponseAsync();
    }
  });

  return () => {
    tokenSubscription.remove();
    responseSubscription.remove();
  };
}
