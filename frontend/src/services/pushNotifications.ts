import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AppState, AppStateStatus, Platform } from "react-native";

import api from "./api";

const INSTALLATION_ID_KEY = "auran_push_installation_id";
const EXPO_PUSH_TOKEN_KEY = "auran_expo_push_token";
export const DIRECT_MESSAGE_CHANNEL_ID = "direct-messages";

export interface DirectMessagePushData {
  version: 1;
  type: "DIRECT_MESSAGE";
  room_id: string;
  message_id: string;
  sender_id: string;
  sender_username: string;
  sender_nickname?: string;
  sender_full_name: string;
  sender_profile_image_url?: string;
  sender_is_admin: boolean;
  url: string;
}

export type PushRegistrationState =
  | "registered"
  | "permission-denied"
  | "unsupported"
  | "unavailable";

export interface PushRegistrationResult {
  state: PushRegistrationState;
  reason?: string;
}

type NavigationListener = (data: DirectMessagePushData) => boolean;

let activeDirectRoomId: string | null = null;
let pendingNavigation: DirectMessagePushData | null = null;
let lastHandledResponseId: string | null = null;
const navigationListeners = new Set<NavigationListener>();

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

export function parseDirectMessagePushData(
  rawData: Record<string, unknown> | null | undefined,
): DirectMessagePushData | null {
  if (!rawData || rawData.type !== "DIRECT_MESSAGE") return null;

  const roomId = stringValue(rawData.room_id);
  const messageId = stringValue(rawData.message_id);
  const senderId = stringValue(rawData.sender_id);
  const senderUsername = stringValue(rawData.sender_username);
  if (!roomId || !messageId || !senderId || !senderUsername) return null;

  return {
    version: 1,
    type: "DIRECT_MESSAGE",
    room_id: roomId,
    message_id: messageId,
    sender_id: senderId,
    sender_username: senderUsername,
    sender_nickname: stringValue(rawData.sender_nickname),
    sender_full_name:
      stringValue(rawData.sender_full_name) || senderUsername,
    sender_profile_image_url: stringValue(rawData.sender_profile_image_url),
    sender_is_admin: booleanValue(rawData.sender_is_admin),
    url: stringValue(rawData.url) || `auran://messages/${roomId}`,
  };
}

export function setActiveDirectRoomId(roomId: string | null): void {
  activeDirectRoomId = roomId;
}

export function shouldSuppressDirectMessageNotification(
  data: DirectMessagePushData | null,
  appState: AppStateStatus = AppState.currentState,
): boolean {
  return (
    appState === "active"
    && data !== null
    && activeDirectRoomId === data.room_id
  );
}

function clearStoredNotificationResponse(): void {
  Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
}

function emitNavigation(data: DirectMessagePushData): boolean {
  const handled = Array.from(navigationListeners).some((listener) => {
    try {
      return listener(data);
    } catch {
      return false;
    }
  });
  pendingNavigation = handled ? null : data;
  return handled;
}

export function subscribeToDirectMessagePushNavigation(
  listener: NavigationListener,
): () => void {
  navigationListeners.add(listener);
  if (pendingNavigation) {
    const pending = pendingNavigation;
    Promise.resolve().then(() => {
      if (navigationListeners.has(listener) && listener(pending)) {
        pendingNavigation = null;
        clearStoredNotificationResponse();
      }
    });
  }
  return () => {
    navigationListeners.delete(listener);
  };
}

export function consumePendingDirectMessagePushNavigation():
  | DirectMessagePushData
  | null {
  const pending = pendingNavigation;
  pendingNavigation = null;
  if (pending) clearStoredNotificationResponse();
  return pending;
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse | null,
): void {
  if (!response) return;
  const responseId = response.notification.request.identifier;
  if (lastHandledResponseId === responseId) return;

  const data = parseDirectMessagePushData(
    response.notification.request.content.data as Record<string, unknown>,
  );
  if (!data) return;
  lastHandledResponseId = responseId;
  if (emitNavigation(data)) clearStoredNotificationResponse();
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = parseDirectMessagePushData(
        notification.request.content.data as Record<string, unknown>,
      );
      const suppress = shouldSuppressDirectMessageNotification(data);
      return {
        shouldPlaySound: !suppress,
        shouldSetBadge: false,
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
      };
    },
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

async function ensureAndroidDirectMessageChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(
    DIRECT_MESSAGE_CHANNEL_ID,
    {
      name: "1:1 메시지",
      description: "새로운 1:1 메시지 알림",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#7C3AED",
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
    },
  );
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

  // Receipt processing is diagnostic cleanup and should not make registration
  // fail when the Expo service is temporarily unavailable.
  api.post("/notifications/push-tokens/sync-receipts").catch(() => undefined);
}

export async function registerCurrentInstallationForPush():
  Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { state: "unsupported", reason: "web" };
  }

  await ensureAndroidDirectMessageChannel();

  // Remote push was removed from Expo Go on Android in SDK 53. Avoid calling
  // getExpoPushTokenAsync there, which otherwise produces a development error.
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
    // Offline startup and missing native credentials are recoverable. The
    // manager retries when the app next becomes active.
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
    // This also protects an offline logout: the old native token stops
    // receiving even if the backend could not be reached for deactivation.
    try {
      await Notifications.unregisterForNotificationsAsync();
    } catch {
      // Some development clients do not expose remote registration.
    }
  }
}

export function startPushNotificationListeners(
  onTokenRolled: () => void,
): () => void {
  if (Platform.OS === "web") return () => undefined;

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );
  const tokenSubscription = Notifications.addPushTokenListener(() => {
    onTokenRolled();
  });

  Notifications.getLastNotificationResponseAsync()
    .then(handleNotificationResponse)
    .catch(() => undefined);

  return () => {
    responseSubscription.remove();
    tokenSubscription.remove();
  };
}
