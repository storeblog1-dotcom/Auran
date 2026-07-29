import { DirectConnectionState, DirectMessage, DirectUser } from "./types";

export const formatMessageClock = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

export const formatDateDivider = (date: Date) => {
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000
  );
  if (dayDifference === 0) return "오늘";
  if (dayDifference === 1) return "어제";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
};

export const formatRoomTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDate =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDate) return formatMessageClock(value);
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(date);
};

export const formatLastSeen = (value?: string | null) => {
  if (!value) return "오프라인";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "오프라인";
  const difference = Date.now() - date.getTime();
  if (difference < 60_000) return "최근 접속 방금 전";
  if (difference < 3_600_000) {
    return `최근 접속 ${Math.max(1, Math.floor(difference / 60_000))}분 전`;
  }
  if (difference < 86_400_000) {
    return `최근 접속 ${Math.floor(difference / 3_600_000)}시간 전`;
  }
  return `최근 접속 ${formatRoomTime(value)}`;
};

export const getPresenceLabel = ({
  peer,
  peerOnline,
  peerTyping,
  connectionState,
  lastSeenAt,
}: {
  peer?: DirectUser | null;
  peerOnline: boolean;
  peerTyping: boolean;
  connectionState: DirectConnectionState;
  lastSeenAt?: string | null;
}) => {
  if (peerTyping) return "입력 중…";
  if (connectionState === "connecting") return "실시간 연결 중…";
  if (connectionState === "reconnecting") return "연결을 복구하는 중…";
  if (connectionState === "offline") return "오프라인 · 전송은 자동 재시도 가능";
  if (peerOnline) return "온라인";
  return formatLastSeen(lastSeenAt || peer?.last_seen_at);
};

export const getMessagePreview = (message?: DirectMessage | null) => {
  if (!message) return "새로운 대화를 시작해 보세요.";
  if (message.message_type === "IMAGE") return "사진을 보냈습니다.";
  if (message.message_type === "POST") return "게시물을 공유했습니다.";
  return message.content || "메시지";
};

export const getDeliveryLabel = (message: DirectMessage) => {
  switch (message.local_status) {
    case "pending":
      return "전송 중";
    case "failed":
      return "전송 실패 · 눌러서 다시 보내기";
    case "read":
      return "읽음";
    case "delivered":
      return "전달됨";
    case "sent":
    default:
      return "전송됨";
  }
};
