import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import api from "../services/api";
import { getDisplayName } from "../utils/displayName";
import { getFullImageUrl } from "../config";

interface FollowRequestItem {
  id: string;
  requester: {
    id: string;
    username: string;
    full_name: string;
    profile_image_url: string | null;
  };
  created_at: string;
}

interface FollowRequestsModalProps {
  visible: boolean;
  onClose: () => void;
  onRequestHandled?: () => void;
}

export const FollowRequestsModal: React.FC<FollowRequestsModalProps> = ({
  visible,
  onClose,
  onRequestHandled,
}) => {
  const [requests, setRequests] = useState<FollowRequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api.get("/users/me/follow-requests");
      if (res.data && res.data.data) {
        setRequests(res.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch follow requests", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchRequests();
    }
  }, [visible]);

  const handleAccept = async (requestId: string) => {
    try {
      await api.post(`/users/me/follow-requests/${requestId}/accept`);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (onRequestHandled) onRequestHandled();
    } catch (error) {
      console.error("Failed to accept follow request", error);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await api.post(`/users/me/follow-requests/${requestId}/reject`);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (onRequestHandled) onRequestHandled();
    } catch (error) {
      console.error("Failed to reject follow request", error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>닫기</Text>
          </TouchableOpacity>
          <Text style={styles.title}>팔로우 요청</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#0095f6" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Image
                  source={{ uri: getFullImageUrl(item.requester.profile_image_url) }}
                  style={styles.avatar}
                />
                <View style={styles.info}>
                  <Text style={styles.username}>{getDisplayName(item.requester)}</Text>
                  <Text style={styles.fullName}>{item.requester.full_name}</Text>
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => handleAccept(item.id)}
                  >
                    <Text style={styles.acceptText}>수락</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleReject(item.id)}
                  >
                    <Text style={styles.rejectText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>대기 중인 팔로우 요청이 없습니다.</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  closeBtn: {
    color: "#fff",
    fontSize: 16,
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#262626",
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  fullName: {
    color: "#8e8e8e",
    fontSize: 13,
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  acceptText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  rejectBtn: {
    backgroundColor: "#262626",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  rejectText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  emptyContainer: {
    marginTop: 80,
    alignItems: "center",
    width: "100%",
  },
  emptyText: {
    color: "#8e8e8e",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
});
