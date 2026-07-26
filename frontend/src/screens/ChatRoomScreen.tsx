import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { WS_BASE_URL, getFullImageUrl } from "../config";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PostDetailModal } from "../components/PostDetailModal";

interface MessageSender {
  id: string;
  username: string;
  full_name: string;
  profile_image_url: string | null;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender: MessageSender;
  content: string | null;
  message_type: string;
  media_url: string | null;
  shared_post_id: string | null;
  created_at: string;
}

export const ChatRoomScreen = ({ route, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const {
    roomId,
    targetUser,
    requestStatus = "ACCEPTED",
    isOutgoingRequest = false,
  } = route.params;
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingImage, setSendingImage] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [roomRequestStatus, setRoomRequestStatus] = useState(requestStatus);
  const [hasSentRequestMessage, setHasSentRequestMessage] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (requestStatus !== "ACCEPTED") return;
    // Focus message input automatically when entering from deep link
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 500);
    return () => clearTimeout(focusTimer);
  }, [requestStatus]);

  useEffect(() => {
    let isMounted = true;

    // 1. Fetch initial message history
    const loadMessages = async () => {
      try {
        const response = await api.get(`/direct/rooms/${roomId}/messages`);
        if (isMounted) {
          const messageItems = response.data?.data || response.data;
          const normalizedMessages = Array.isArray(messageItems)
            ? messageItems
            : [];
          setMessages(normalizedMessages);
          setHasSentRequestMessage(normalizedMessages.length > 0);
        }
      } catch (error) {
        console.error("Failed to load room messages", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMessages();

    // 2. Connect WebSocket
    const connectWebSocket = async () => {
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return;

      const wsUrl = `${WS_BASE_URL}/direct/ws/${roomId}?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connected to room:", roomId);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "error") {
            setMessages((prev) => prev.filter((message) => !message.id.startsWith("temp-")));
            Alert.alert("전송 제한", data.message || "메시지를 보낼 수 없습니다.");
            return;
          }
          const newMsg = data.message || (data.id ? data : null);
          if (newMsg && newMsg.id) {
            setMessages((prev) => {
              const filtered = prev.filter(
                (m) => !m.id.startsWith("temp-") || m.content !== newMsg.content
              );
              if (filtered.some((m) => m.id === newMsg.id)) return filtered;
              return [...filtered, newMsg];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        } catch (e) {
          console.error("WebSocket message parse error", e);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
      };

      ws.current = socket;
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [roomId]);

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    if (
      roomRequestStatus === "PENDING" &&
      (!isOutgoingRequest || hasSentRequestMessage)
    ) {
      Alert.alert(
        "요청 승인 대기 중",
        "상대방이 메시지 요청을 승인할 때까지 추가 메시지를 보낼 수 없습니다."
      );
      return;
    }
    const contentToSend = inputText.trim();
    setInputText("");

    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      id: tempId,
      room_id: roomId,
      sender: {
        id: currentUser?.id || "",
        username: currentUser?.username || "",
        full_name: currentUser?.full_name || "",
        profile_image_url: currentUser?.profile_image_url || null,
      },
      content: contentToSend,
      message_type: "TEXT",
      media_url: null,
      shared_post_id: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      if (roomRequestStatus === "PENDING") {
        const res = await api.post(`/direct/rooms/${roomId}/messages`, {
          content: contentToSend,
          message_type: "TEXT",
        });
        const savedMessage = res.data?.data || res.data;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === tempId ? savedMessage : message
          )
        );
        setHasSentRequestMessage(true);
      } else if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            action: "send_message",
            content: contentToSend,
            message_type: "TEXT",
          })
        );
      } else {
        const res = await api.post(`/direct/rooms/${roomId}/messages`, {
          content: contentToSend,
          message_type: "TEXT",
        });
        setMessages((prev) => prev.map((m) => (m.id === tempId ? res.data : m)));
      }
    } catch (error) {
      console.error("Failed to send message", error);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      Alert.alert(
        "전송 실패",
        (error as any)?.response?.data?.error?.message ||
          (error as any)?.response?.data?.detail ||
          "메시지를 보내지 못했습니다."
      );
    }
  };

  const handlePickAndSendImage = async () => {
    if (roomRequestStatus !== "ACCEPTED") {
      Alert.alert(
        "전송 제한",
        "상대방이 요청을 승인하기 전에는 사진을 보낼 수 없습니다."
      );
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert("사진 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      setSendingImage(true);
      const asset = result.assets[0];

      const formData = new FormData();
      const filename = asset.uri.split("/").pop() || "upload.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, filename);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: filename,
          type: type,
        } as any);
      }

      const uploadRes = await api.post("/posts/upload-media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const mediaUrl = uploadRes.data.url;

      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            action: "send_message",
            content: "사진",
            message_type: "IMAGE",
            media_url: mediaUrl,
          })
        );
      } else {
        const res = await api.post(`/direct/rooms/${roomId}/messages`, {
          content: "사진",
          message_type: "IMAGE",
          media_url: mediaUrl,
        });
        setMessages((prev) => [...prev, res.data]);
      }
    } catch (error) {
      console.error("Failed to send image message", error);
      alert("이미지 전송에 실패했습니다.");
    } finally {
      setSendingImage(false);
    }
  };

  const handleAcceptRequest = async () => {
    try {
      await api.post(`/direct/rooms/${roomId}/accept`);
      setRoomRequestStatus("ACCEPTED");
    } catch (error: any) {
      Alert.alert(
        "오류",
        error.response?.data?.error?.message ||
          error.response?.data?.detail ||
          "메시지 요청을 승인하지 못했습니다."
      );
    }
  };

  const handleRejectRequest = async () => {
    try {
      await api.post(`/direct/rooms/${roomId}/reject`);
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        "오류",
        error.response?.data?.error?.message ||
          error.response?.data?.detail ||
          "메시지 요청을 거절하지 못했습니다."
      );
    }
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isMine = item.sender.id === currentUser?.id;

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.myMessageRow : styles.otherMessageRow,
        ]}
      >
        {!isMine && (
          <Image
            source={{ uri: getFullImageUrl(item.sender.profile_image_url) }}
            style={styles.senderAvatar}
          />
        )}
        <View
          style={[
            styles.bubble,
            isMine
              ? [styles.myBubble, { alignSelf: "flex-end" }]
              : [styles.otherBubble, { alignSelf: "flex-start", backgroundColor: colors.chatBubbleOther }],
          ]}
        >
          {item.message_type === "IMAGE" && item.media_url ? (
            <Image
              source={{ uri: getFullImageUrl(item.media_url) }}
              style={styles.chatImage}
              resizeMode="cover"
            />
          ) : item.message_type === "POST" && item.shared_post_id ? (
            <TouchableOpacity
              style={styles.postMessage}
              activeOpacity={0.75}
              onPress={() => {
                setSelectedPostId(item.shared_post_id);
                setPostModalVisible(true);
              }}
            >
              <Ionicons
                name="images-outline"
                size={24}
                color={isMine ? "#ffffff" : colors.textPrimary}
              />
              <View style={styles.postMessageText}>
                <Text
                  style={[
                    styles.postMessageTitle,
                    { color: isMine ? "#ffffff" : colors.textPrimary },
                  ]}
                >
                  게시물
                </Text>
                <Text
                  style={[
                    styles.postMessageAction,
                    { color: isMine ? "#e0f2fe" : colors.accentBlue },
                  ]}
                >
                  눌러서 보기
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.messageText, { color: isMine ? "#ffffff" : colors.textPrimary }]}>
              {item.content}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const canCompose =
    roomRequestStatus === "ACCEPTED" ||
    (roomRequestStatus === "PENDING" &&
      isOutgoingRequest &&
      !hasSentRequestMessage);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        <Image
          source={{ uri: getFullImageUrl(targetUser?.profile_image_url) }}
          style={styles.headerAvatar}
        />

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerUsername, { color: colors.textPrimary }]}>
            {targetUser?.username || "대화 상대"}
          </Text>
          <Text style={[styles.headerFullName, { color: colors.textSecondary }]}>
            {targetUser?.full_name || ""}
          </Text>
        </View>
        <View style={{ width: 30 }} />
      </View>

      {roomRequestStatus === "PENDING" && (
        <View style={[styles.requestBanner, { backgroundColor: colors.bgInput }]}>
          <Text style={[styles.requestBannerText, { color: colors.textSecondary }]}>
            {isOutgoingRequest
              ? hasSentRequestMessage
                ? "메시지 요청을 보냈습니다. 상대방의 승인을 기다리고 있습니다."
                : "비팔로워에게는 첫 텍스트 메시지 1개만 보낼 수 있습니다."
              : "이 메시지 요청을 승인해야 대화를 계속할 수 있습니다."}
          </Text>
          {!isOutgoingRequest && (
            <View style={styles.requestBannerActions}>
              <TouchableOpacity
                style={[styles.requestActionButton, { backgroundColor: colors.accentBlue }]}
                onPress={handleAcceptRequest}
              >
                <Text style={styles.requestActionPrimaryText}>승인</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.requestActionButton, { backgroundColor: colors.bgCard }]}
                onPress={handleRejectRequest}
              >
                <Text style={[styles.requestActionSecondaryText, { color: colors.textPrimary }]}>
                  거절
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Messages List */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accentBlue} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputContainer, { backgroundColor: colors.bgPrimary, borderTopColor: colors.borderColor, paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
          <TouchableOpacity
            style={styles.imagePickerBtn}
            onPress={handlePickAndSendImage}
            disabled={sendingImage || roomRequestStatus !== "ACCEPTED"}
          >
            {sendingImage ? (
              <ActivityIndicator size="small" color={colors.accentBlue} />
            ) : (
              <Ionicons
                name="camera-outline"
                size={24}
                color={
                  roomRequestStatus === "ACCEPTED"
                    ? colors.accentBlue
                    : colors.textMuted
                }
              />
            )}
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
            placeholder={
              canCompose
                ? "메시지 보내기..."
                : "요청 승인 대기 중"
            }
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={canCompose}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!inputText.trim() || !canCompose) && styles.sendBtnDisabled,
            ]}
            onPress={handleSendText}
            disabled={!inputText.trim() || !canCompose}
          >
            <Text
              style={[
                styles.sendBtnText,
                (!inputText.trim() || !canCompose) && styles.sendBtnTextDisabled,
              ]}
            >
              보내기
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <PostDetailModal
        visible={postModalVisible}
        postId={selectedPostId}
        onClose={() => {
          setPostModalVisible(false);
          setSelectedPostId(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: "#fff",
    fontSize: 22,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#262626",
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  headerUsername: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  headerFullName: {
    color: "#8e8e8e",
    fontSize: 12,
  },
  requestBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  requestBannerText: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
  },
  requestBannerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  requestActionButton: {
    minWidth: 82,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  requestActionPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  requestActionSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
  },
  myMessageRow: {
    justifyContent: "flex-end",
  },
  otherMessageRow: {
    justifyContent: "flex-start",
  },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "78%",
    minWidth: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    justifyContent: "center",
  },
  myBubble: {
    backgroundColor: "#3797f0",
  },
  otherBubble: {
    backgroundColor: "#262626",
  },
  messageText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
    flexWrap: "wrap",
  },
  myMessageText: {
    color: "#fff",
  },
  chatImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  postMessage: {
    minWidth: 170,
    flexDirection: "row",
    alignItems: "center",
  },
  postMessageText: {
    marginLeft: 10,
  },
  postMessageTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  postMessageAction: {
    fontSize: 12,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#262626",
    backgroundColor: "#000",
  },
  imagePickerBtn: {
    padding: 8,
  },
  imageIcon: {
    fontSize: 22,
  },
  input: {
    flex: 1,
    color: "#fff",
    backgroundColor: "#121212",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 38,
    maxHeight: 100,
    marginHorizontal: 8,
  },
  sendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: "#0095f6",
    fontWeight: "700",
    fontSize: 14,
  },
  sendBtnTextDisabled: {
    color: "#00487c",
  },
});
