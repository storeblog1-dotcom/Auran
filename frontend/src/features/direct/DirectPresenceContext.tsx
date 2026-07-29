import "react-native-url-polyfill/auto";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { DirectConnectionState } from "./types";

interface PeerPresence {
  is_online: boolean;
  last_seen_at: string | null;
}

interface AppPresenceConfig {
  supabase_url: string;
  supabase_anon_key: string;
  access_token: string;
  expires_at?: string | null;
  user_id: string;
  last_seen_at?: string | null;
  presence_topic: string;
  peer_presence_topics: string[];
}

interface DirectPresenceContextValue {
  presenceByUserId: Record<string, PeerPresence>;
  connectionState: DirectConnectionState;
  refreshPresencePeers: () => void;
}

const DirectPresenceContext = createContext<DirectPresenceContextValue>({
  presenceByUserId: {},
  connectionState: "offline",
  refreshPresencePeers: () => undefined,
});

const unwrap = <T,>(payload: { data?: T } | T): T => {
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

const userIdFromPresenceTopic = (topic: string) => {
  const prefix = "dm-user:";
  return topic.startsWith(prefix) ? topic.slice(prefix.length) : "";
};

export const DirectPresenceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { token, user } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [connectionState, setConnectionState] =
    useState<DirectConnectionState>("offline");
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<string, PeerPresence>
  >({});

  const refreshPresencePeers = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token || !user?.id) {
      setConnectionState("offline");
      setPresenceByUserId({});
      return;
    }

    let cancelled = false;
    let client: ReturnType<typeof createClient> | null = null;
    let ownChannel: RealtimeChannel | null = null;
    let peerChannels: RealtimeChannel[] = [];
    let authRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let startRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let appStateSubscription: ReturnType<
      typeof AppState.addEventListener
    > | null = null;
    let ownPresenceSubscribed = false;

    const heartbeat = (force = false) => {
      if (!force && AppState.currentState !== "active") return;
      void api.post("/direct/presence/heartbeat").catch(() => undefined);
    };
    const retryStartWhenActive = () => {
      if (cancelled) return;
      if (AppState.currentState === "active") {
        setGeneration((value) => value + 1);
        return;
      }
      startRetryTimer = setTimeout(retryStartWhenActive, 15_000);
    };

    const start = async () => {
      setConnectionState("connecting");
      const response = await api.get("/direct/realtime/config");
      const config = unwrap<AppPresenceConfig>(response.data);
      if (cancelled) return;

      client = createClient(config.supabase_url, config.supabase_anon_key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      });
      await client.realtime.setAuth(config.access_token);
      if (cancelled || !client) return;

      const trackSelf = () => {
        if (!ownChannel || !ownPresenceSubscribed) return;
        void ownChannel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
          last_seen_at: config.last_seen_at ?? null,
        });
      };
      const untrackSelf = () => {
        if (!ownChannel || !ownPresenceSubscribed) return;
        void ownChannel.untrack();
      };

      ownChannel = client.channel(config.presence_topic, {
        config: {
          private: true,
          presence: { key: user.id },
        },
      });
      ownChannel.subscribe((status) => {
        if (cancelled) return;
        ownPresenceSubscribed = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") {
          setConnectionState("online");
          if (AppState.currentState === "active") trackSelf();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setConnectionState("reconnecting");
        } else if (status === "CLOSED") {
          setConnectionState("offline");
        }
      });

      peerChannels = (config.peer_presence_topics || []).map((topic) => {
        const peerIdFromTopic = userIdFromPresenceTopic(topic);
        const channel = client!.channel(topic, {
          config: { private: true },
        });
        let previouslyOnline = new Set<string>();
        channel.on("presence", { event: "sync" }, () => {
          const nextOnline = new Set<string>();
          const nextPresence: Record<string, PeerPresence> = {};
          const state = channel.presenceState<Record<string, any>>();
          Object.values(state).forEach((presences) => {
            presences.forEach((presence) => {
              const peerId = String(
                presence.user_id ||
                  peerIdFromTopic ||
                  presence.presence_ref ||
                  ""
              );
              if (!peerId) return;
              nextOnline.add(peerId);
              nextPresence[peerId] = {
                is_online: true,
                last_seen_at: presence.last_seen_at ?? null,
              };
            });
          });
          previouslyOnline.forEach((peerId) => {
            if (!nextOnline.has(peerId)) {
              nextPresence[peerId] = {
                is_online: false,
                last_seen_at: new Date().toISOString(),
              };
            }
          });
          if (peerIdFromTopic && nextOnline.size === 0) {
            nextPresence[peerIdFromTopic] = nextPresence[peerIdFromTopic] || {
              is_online: false,
              last_seen_at: null,
            };
          }
          previouslyOnline = nextOnline;
          setPresenceByUserId((previous) => ({
            ...previous,
            ...nextPresence,
          }));
        });
        channel.subscribe();
        return channel;
      });

      appStateSubscription = AppState.addEventListener(
        "change",
        (nextState) => {
          if (nextState === "active") {
            heartbeat(true);
            // Re-create private channels with a fresh short-lived token after
            // any background suspension. Mobile OSes may have closed the
            // underlying socket while JavaScript was paused.
            setGeneration((value) => value + 1);
          } else {
            heartbeat(true);
            untrackSelf();
          }
        }
      );
      heartbeat(true);
      heartbeatTimer = setInterval(heartbeat, 45_000);

      const scheduleAuthRefresh = (expiresAt?: string | null) => {
        if (cancelled || !client) return;
        if (authRefreshTimer) clearTimeout(authRefreshTimer);
        const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
        const delay = Number.isNaN(expiry)
          ? 4 * 60_000
          : Math.max(30_000, expiry - Date.now() - 60_000);
        authRefreshTimer = setTimeout(() => void refreshAuth(), delay);
      };
      const refreshAuth = async () => {
        if (AppState.currentState !== "active") {
          if (!cancelled) {
            authRefreshTimer = setTimeout(() => void refreshAuth(), 30_000);
          }
          return;
        }
        try {
          const refreshResponse = await api.get("/direct/realtime/config");
          const refreshed = unwrap<AppPresenceConfig>(refreshResponse.data);
          await client?.realtime.setAuth(refreshed.access_token);
          scheduleAuthRefresh(refreshed.expires_at);
        } catch {
          setConnectionState("reconnecting");
          if (!cancelled) {
            authRefreshTimer = setTimeout(() => void refreshAuth(), 15_000);
          }
        }
      };
      scheduleAuthRefresh(config.expires_at);
    };

    void start().catch(() => {
      if (!cancelled) {
        setConnectionState("offline");
        startRetryTimer = setTimeout(retryStartWhenActive, 15_000);
      }
    });

    return () => {
      cancelled = true;
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (startRetryTimer) clearTimeout(startRetryTimer);
      appStateSubscription?.remove();
      if (ownChannel) {
        void ownChannel.untrack();
        void client?.removeChannel(ownChannel);
      }
      peerChannels.forEach((channel) => {
        void client?.removeChannel(channel);
      });
    };
  }, [generation, token, user?.id]);

  const contextValue = useMemo(
    () => ({
      presenceByUserId,
      connectionState,
      refreshPresencePeers,
    }),
    [connectionState, presenceByUserId, refreshPresencePeers]
  );

  return (
    <DirectPresenceContext.Provider value={contextValue}>
      {children}
    </DirectPresenceContext.Provider>
  );
};

export const useDirectPresence = () => useContext(DirectPresenceContext);
