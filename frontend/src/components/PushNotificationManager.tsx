import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAuth } from "../context/AuthContext";
import {
  registerCurrentInstallationForPush,
  startPushNotificationListeners,
} from "../services/pushNotifications";
import { navigateFromPushData } from "../navigation/RootNavigator";

const RETRY_INTERVAL_MS = 60_000;

/**
 * Registers the signed-in installation and owns the native notification
 * listeners. It renders nothing, so it can sit beside the root navigator.
 */
export const PushNotificationManager: React.FC = () => {
  const { token, user } = useAuth();
  const lastAttemptAtRef = useRef(0);
  const registrationRunningRef = useRef(false);

  useEffect(() => {
    if (!token || !user?.id) return;
    let cancelled = false;

    const register = async (force = false) => {
      const now = Date.now();
      if (
        registrationRunningRef.current
        || (!force && now - lastAttemptAtRef.current < RETRY_INTERVAL_MS)
      ) {
        return;
      }
      registrationRunningRef.current = true;
      lastAttemptAtRef.current = now;
      try {
        await registerCurrentInstallationForPush();
      } finally {
        if (!cancelled) registrationRunningRef.current = false;
      }
    };

    void register(true);
    const stopNotificationListeners = startPushNotificationListeners(
      () => void register(true),
      navigateFromPushData,
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void register();
      },
    );

    return () => {
      cancelled = true;
      registrationRunningRef.current = false;
      stopNotificationListeners();
      appStateSubscription.remove();
    };
  }, [token, user?.id]);

  return null;
};
