import "react-native-url-polyfill/auto";

import { AppState } from "react-native";
import {
  createClient,
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";
import api from "../../services/api";
import { normalizeDirectMessage } from "./directApi";
import {
  DirectRealtimeCallbacks,
  DirectRealtimeEvent,
  DirectRealtimeSubscription,
  DirectRealtimeTransport,
} from "./types";

interface RealtimeConfig {
  supabase_url: string;
  supabase_anon_key: string;
  access_token: string;
  expires_at?: string | null;
  channel_topic?: string | null;
  presence_topic?: string | null;
  peer_presence_topics?: string[];
  user_id?: string;
  last_seen_at?: string | null;
}

const unwrap = <T>(payload: { data?: T } | T): T => {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: T }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const readPayload = (value: any) => value?.payload ?? value ?? {};

const toRealtimeEvent = (
  eventName: string,
  rawPayload: any,
  roomId: string
): DirectRealtimeEvent | null => {
  const payload = readPayload(rawPayload);
  if (eventName === "message.created" || eventName === "message.updated") {
    const messageValue = payload.message ?? payload.record ?? payload;
    if (!messageValue?.id) return null;
    return {
      type: eventName,
      room_id: String(payload.room_id || messageValue.room_id || roomId),
      message: normalizeDirectMessage(messageValue, "sent"),
    };
  }
  if (eventName === "message.read") {
    if (!payload.user_id) return null;
    return {
      type: "message.read",
      room_id: String(payload.room_id || roomId),
      user_id: String(payload.user_id),
      message_ids: Array.isArray(payload.message_ids)
        ? payload.message_ids.map(String)
        : undefined,
      read_at: payload.read_at || new Date().toISOString(),
    };
  }
  if (eventName === "message.delivered") {
    if (!payload.user_id) return null;
    return {
      type: "message.delivered",
      room_id: String(payload.room_id || roomId),
      user_id: String(payload.user_id),
      message_ids: Array.isArray(payload.message_ids)
        ? payload.message_ids.map(String)
        : undefined,
      delivered_at: payload.delivered_at || new Date().toISOString(),
    };
  }
  if (eventName === "typing") {
    if (!payload.user_id) return null;
    return {
      type: "typing",
      room_id: String(payload.room_id || roomId),
      user_id: String(payload.user_id),
      is_typing: Boolean(payload.is_typing),
    };
  }
  return null;
};

const addBroadcastListener = (
  channel: RealtimeChannel,
  eventName:
    | "message.created"
    | "message.updated"
    | "message.delivered"
    | "message.read"
    | "typing",
  roomId: string,
  callbacks: DirectRealtimeCallbacks
) => {
  channel.on("broadcast", { event: eventName }, (payload) => {
    const event = toRealtimeEvent(eventName, payload, roomId);
    if (event) callbacks.onEvent(event);
  });
};

const sendBroadcast = async (
  channel: RealtimeChannel,
  event: string,
  payload: Record<string, unknown>
) => {
  try {
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  } catch {
    // Presence and typing are supplemental. Message delivery remains REST +
    // server-side Broadcast and must not be blocked by a transient channel.
  }
};

class SupabaseDirectRealtimeTransport implements DirectRealtimeTransport {
  async subscribe(
    roomId: string,
    userId: string,
    callbacks: DirectRealtimeCallbacks
  ): Promise<DirectRealtimeSubscription> {
    callbacks.onConnectionChange("connecting");

    const response = await api.get("/direct/realtime/config", {
      params: { room_id: roomId },
    });
    const config = unwrap<RealtimeConfig>(response.data);
    const client: SupabaseClient = createClient(
      config.supabase_url,
      config.supabase_anon_key,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      }
    );

    await client.realtime.setAuth(config.access_token);
    const topic = config.channel_topic || `dm:${roomId}`;
    const channel = client.channel(topic, {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
      },
    });

    addBroadcastListener(channel, "message.created", roomId, callbacks);
    addBroadcastListener(channel, "message.updated", roomId, callbacks);
    addBroadcastListener(channel, "message.delivered", roomId, callbacks);
    addBroadcastListener(channel, "message.read", roomId, callbacks);
    addBroadcastListener(channel, "typing", roomId, callbacks);

    const presenceTopic = config.presence_topic || `dm-user:${userId}`;
    const ownPresenceChannel = client.channel(presenceTopic, {
      config: {
        private: true,
        presence: { key: userId },
      },
    });
    const peerPresenceChannels = (config.peer_presence_topics || []).map(
      (peerTopic) => {
        const peerChannel = client.channel(peerTopic, {
          config: { private: true },
        });
        let lastPresenceIds = new Set<string>();
        peerChannel.on("presence", { event: "sync" }, () => {
          const nextPresenceIds = new Set<string>();
          const state = peerChannel.presenceState<Record<string, any>>();
          Object.values(state).forEach((presences) => {
            presences.forEach((presence) => {
              const peerId = String(
                presence.user_id || presence.presence_ref || ""
              );
              if (!peerId) return;
              nextPresenceIds.add(peerId);
              callbacks.onEvent({
                type: "presence",
                room_id: roomId,
                user_id: peerId,
                is_online: true,
                last_seen_at: presence.last_seen_at ?? null,
              });
            });
          });
          lastPresenceIds.forEach((peerId) => {
            if (!nextPresenceIds.has(peerId)) {
              callbacks.onEvent({
                type: "presence",
                room_id: roomId,
                user_id: peerId,
                is_online: false,
                last_seen_at: new Date().toISOString(),
              });
            }
          });
          lastPresenceIds = nextPresenceIds;
        });
        return peerChannel;
      }
    );

    let subscribed = false;
    let presenceSubscribed = false;
    let closed = false;
    let authRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshRealtimeAuth: () => Promise<void>;
    const scheduleAuthRefresh = (expiresAt?: string | null) => {
      if (closed) return;
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
      const expiresAtMs = expiresAt ? Date.parse(expiresAt) : NaN;
      const delay = Number.isNaN(expiresAtMs)
        ? 4 * 60_000
        : Math.max(30_000, expiresAtMs - Date.now() - 60_000);
      authRefreshTimer = setTimeout(
        () => void refreshRealtimeAuth(),
        delay
      );
    };
    refreshRealtimeAuth = async () => {
      if (!appIsActive) {
        if (!closed) {
          authRefreshTimer = setTimeout(
            () => void refreshRealtimeAuth(),
            30_000
          );
        }
        return;
      }
      try {
        const refreshResponse = await api.get("/direct/realtime/config", {
          params: { room_id: roomId },
        });
        const refreshed = unwrap<RealtimeConfig>(refreshResponse.data);
        await client.realtime.setAuth(refreshed.access_token);
        scheduleAuthRefresh(refreshed.expires_at);
      } catch {
        callbacks.onConnectionChange("reconnecting");
        if (!closed) {
          authRefreshTimer = setTimeout(
            () => void refreshRealtimeAuth(),
            15_000
          );
        }
      }
    };
    scheduleAuthRefresh(config.expires_at);
    let appIsActive = AppState.currentState === "active";
    const trackPresence = () =>
      ownPresenceChannel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        last_seen_at: config.last_seen_at ?? null,
      });
    const untrackPresence = () => ownPresenceChannel.untrack();

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        callbacks.onConnectionChange("online");
        if (appIsActive) void trackPresence();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        callbacks.onConnectionChange("reconnecting");
      } else if (status === "CLOSED") {
        callbacks.onConnectionChange("offline");
      }
    });
    ownPresenceChannel.subscribe((status) => {
      presenceSubscribed = status === "SUBSCRIBED";
      if (presenceSubscribed && appIsActive) void trackPresence();
    });
    peerPresenceChannels.forEach((peerChannel) => {
      peerChannel.subscribe();
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        appIsActive = nextState === "active";
        if (!presenceSubscribed) return;
        if (appIsActive) {
          void refreshRealtimeAuth();
          void trackPresence();
        } else {
          void untrackPresence();
        }
      }
    );

    return {
      close: () => {
        closed = true;
        if (authRefreshTimer) clearTimeout(authRefreshTimer);
        appStateSubscription.remove();
        callbacks.onConnectionChange("offline");
        void untrackPresence();
        void client.removeChannel(channel);
        void client.removeChannel(ownPresenceChannel);
        peerPresenceChannels.forEach((peerChannel) => {
          void client.removeChannel(peerChannel);
        });
      },
      setTyping: (isTyping) => {
        if (!subscribed || !appIsActive) return;
        void sendBroadcast(channel, "typing", {
          room_id: roomId,
          user_id: userId,
          is_typing: isTyping,
        });
      },
      setPresence: (isOnline) => {
        if (!presenceSubscribed) return;
        if (isOnline && appIsActive) {
          void trackPresence();
        } else {
          void untrackPresence();
        }
      },
    };
  }
}

export const directRealtime: DirectRealtimeTransport =
  new SupabaseDirectRealtimeTransport();
