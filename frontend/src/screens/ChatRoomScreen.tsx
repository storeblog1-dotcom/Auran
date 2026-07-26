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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { WS_BASE_URL, getFullImageUrl } from "../config";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

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
  const { roomId, targetUser } = route.params;
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingImage, setSendingImage] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Focus message input automatically when entering from deep link
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 500);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Fetch initial message history
    const loadMessages = async () => {
      try {
        const response = await api.get(`/direct/rooms/${roomId}/messages`);
        if (isMounted) {
          setMessages(response.data);
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
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
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
    }
  };

  const handlePickAndSendImage = async () => {
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
          ) : (
            <Text style={[styles.messageText, { color: isMine ? "#ffffff" : colors.textPrimary }]}>
              {item.content}
            </Text>
          )}
        </View>
      </View>
    );
  };

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
            disabled={sendingImage}
          >
            {sendingImage ? (
              <ActivityIndicator size="small" color={colors.accentBlue} />
            ) : (
              <Ionicons name="camera-outline" size={24} color={colors.accentBlue} />
            )}
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary }]}
            placeholder="메시지 보내기..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              !inputText.trim() && styles.sendBtnDisabled,
            ]}
            onPress={handleSendText}
            disabled={!inputText.trim()}
          >
            <Text
              style={[
                styles.sendBtnText,
                !inputText.trim() && styles.sendBtnTextDisabled,
              ]}
            >
              보내기
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
