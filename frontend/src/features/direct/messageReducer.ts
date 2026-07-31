import {
  DirectDeliveryState,
  DirectMessage,
  DirectTimelineItem,
} from "./types";

export interface DirectMessageState {
  byId: Record<string, DirectMessage>;
  order: string[];
  idByClientMessageId: Record<string, string>;
}

export type DirectMessageAction =
  | { type: "conversation.reset" }
  | { type: "history.received"; messages: DirectMessage[] }
  | { type: "message.optimistic"; message: DirectMessage }
  | { type: "message.received"; message: DirectMessage }
  | {
      type: "message.acknowledged";
      clientMessageId: string;
      message: DirectMessage;
    }
  | {
      type: "message.failed";
      clientMessageId: string;
      errorMessage: string;
    }
  | {
      type: "messages.read";
      messageIds?: string[];
      senderId?: string;
      readAt: string;
    }
  | {
      type: "messages.delivered";
      messageIds?: string[];
      senderId?: string;
      deliveredAt: string;
    };

export const initialDirectMessageState: DirectMessageState = {
  byId: {},
  order: [],
  idByClientMessageId: {},
};

const deliveryRank: Record<Exclude<DirectDeliveryState, "failed">, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

const chooseDeliveryState = (
  existing: DirectDeliveryState | undefined,
  incoming: DirectDeliveryState
): DirectDeliveryState => {
  if (incoming === "failed") return "failed";
  if (!existing || existing === "failed") return incoming;
  return deliveryRank[incoming] >= deliveryRank[existing] ? incoming : existing;
};

const compareMessageIds = (
  firstId: string,
  secondId: string,
  byId: Record<string, DirectMessage>
) => {
  const first = byId[firstId];
  const second = byId[secondId];
  const firstTime = Date.parse(first?.created_at || "") || 0;
  const secondTime = Date.parse(second?.created_at || "") || 0;
  if (firstTime !== secondTime) return firstTime - secondTime;
  return firstId.localeCompare(secondId);
};

const rebuildIndexes = (
  byId: Record<string, DirectMessage>
): DirectMessageState => {
  const order = Object.keys(byId).sort((firstId, secondId) =>
    compareMessageIds(firstId, secondId, byId)
  );
  const idByClientMessageId: Record<string, string> = {};
  order.forEach((id) => {
    const clientMessageId = byId[id]?.client_message_id;
    if (clientMessageId) idByClientMessageId[clientMessageId] = id;
  });
  return { byId, order, idByClientMessageId };
};

const mergeMessage = (
  current: DirectMessage | undefined,
  incoming: DirectMessage
): DirectMessage => {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    sender: { ...current.sender, ...incoming.sender },
    local_status: chooseDeliveryState(
      current.local_status,
      incoming.local_status
    ),
    error_message:
      incoming.local_status === "failed"
        ? incoming.error_message
        : null,
  };
};

const upsertMessage = (
  state: DirectMessageState,
  incoming: DirectMessage
): DirectMessageState => {
  const clientMessageId = incoming.client_message_id || undefined;
  const aliasedId = clientMessageId
    ? state.idByClientMessageId[clientMessageId]
    : undefined;
  const previousId = aliasedId || incoming.id;
  const previous = state.byId[previousId] || state.byId[incoming.id];
  const nextMessage = mergeMessage(previous, incoming);
  const nextById = { ...state.byId };

  if (previousId !== incoming.id) delete nextById[previousId];
  nextById[incoming.id] = nextMessage;
  return rebuildIndexes(nextById);
};

export const directMessageReducer = (
  state: DirectMessageState,
  action: DirectMessageAction
): DirectMessageState => {
  switch (action.type) {
    case "conversation.reset":
      return initialDirectMessageState;
    case "history.received": {
      let nextState = state;
      action.messages.forEach((message) => {
        nextState = upsertMessage(nextState, message);
      });
      return nextState;
    }
    case "message.optimistic":
    case "message.received":
      return upsertMessage(state, action.message);
    case "message.acknowledged":
      return upsertMessage(state, {
        ...action.message,
        client_message_id:
          action.message.client_message_id || action.clientMessageId,
        local_status: chooseDeliveryState(
          action.message.local_status,
          "sent"
        ),
      });
    case "message.failed": {
      const messageId = state.idByClientMessageId[action.clientMessageId];
      const message = messageId ? state.byId[messageId] : undefined;
      if (!message) return state;
      return {
        ...state,
        byId: {
          ...state.byId,
          [messageId]: {
            ...message,
            local_status: "failed",
            error_message: action.errorMessage,
          },
        },
      };
    }
    case "messages.read": {
      const ids = action.messageIds
        ? new Set(action.messageIds)
        : null;
      const readCheckpoint = Date.parse(action.readAt);
      let changed = false;
      const nextById: Record<string, DirectMessage> = { ...state.byId };
      state.order.forEach((id) => {
        const message = state.byId[id];
        if (
          (ids && !ids.has(id)) ||
          (!ids && action.senderId && message.sender.id !== action.senderId) ||
          (!ids &&
            !Number.isNaN(readCheckpoint) &&
            (Date.parse(message.created_at) || 0) > readCheckpoint)
        ) {
          return;
        }
        if (message.local_status === "read" && message.read_at) return;
        nextById[id] = {
          ...message,
          local_status: "read",
          read_at: action.readAt,
        };
        changed = true;
      });
      return changed ? { ...state, byId: nextById } : state;
    }
    case "messages.delivered": {
      const ids = action.messageIds
        ? new Set(action.messageIds)
        : null;
      const deliveredCheckpoint = Date.parse(action.deliveredAt);
      let changed = false;
      const nextById: Record<string, DirectMessage> = { ...state.byId };
      state.order.forEach((id) => {
        const message = state.byId[id];
        if (
          (ids && !ids.has(id)) ||
          (!ids && action.senderId && message.sender.id !== action.senderId) ||
          (!ids &&
            !Number.isNaN(deliveredCheckpoint) &&
            (Date.parse(message.created_at) || 0) > deliveredCheckpoint)
        ) {
          return;
        }
        if (
          message.local_status === "read" ||
          (message.local_status === "delivered" && message.delivered_at)
        ) {
          return;
        }
        nextById[id] = {
          ...message,
          local_status: "delivered",
          delivered_at: action.deliveredAt,
        };
        changed = true;
      });
      return changed ? { ...state, byId: nextById } : state;
    }
    default:
      return state;
  }
};

export const selectDirectMessages = (
  state: DirectMessageState
): DirectMessage[] => state.order.map((id) => state.byId[id]).filter(Boolean);

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export const buildDirectTimeline = (
  messages: DirectMessage[]
): DirectTimelineItem[] => {
  const items: DirectTimelineItem[] = [];
  let lastDateKey = "";

  messages.forEach((message, index) => {
    const date = new Date(message.created_at);
    const dateKey = Number.isNaN(date.getTime())
      ? "unknown"
      : localDateKey(date);
    const isNewDate = dateKey !== lastDateKey;

    if (isNewDate) {
      items.push({
        type: "date",
        id: `date-${dateKey}`,
        date,
      });
      lastDateKey = dateKey;
    }

    const prevMessage = index > 0 ? messages[index - 1] : null;
    const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;

    const prevDate = prevMessage ? new Date(prevMessage.created_at) : null;
    const prevDateKey =
      prevDate && !Number.isNaN(prevDate.getTime()) ? localDateKey(prevDate) : "";

    const nextDate = nextMessage ? new Date(nextMessage.created_at) : null;
    const nextDateKey =
      nextDate && !Number.isNaN(nextDate.getTime()) ? localDateKey(nextDate) : "";

    const isFirstInGroup =
      !prevMessage ||
      prevMessage.sender.id !== message.sender.id ||
      dateKey !== prevDateKey;

    const isLastInGroup =
      !nextMessage ||
      nextMessage.sender.id !== message.sender.id ||
      dateKey !== nextDateKey;

    items.push({
      type: "message",
      id: `message-${message.id}`,
      message,
      isFirstInGroup,
      isLastInGroup,
    });
  });

  return items;
};
