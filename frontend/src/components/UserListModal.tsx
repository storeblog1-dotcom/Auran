import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getDisplayName } from "../utils/displayName";
import { useTheme } from "../context/ThemeContext";
import {
  AdminAvatar,
  AdminBadge,
  showAdminProfilePrivateAlert,
} from "./AdminIdentity";

interface UserListModalProps {
  visible: boolean;
  username: string | null;
  type: "followers" | "following";
  onClose: () => void;
  onSelectUser?: (username: string) => void;
}

export const UserListModal: React.FC<UserListModalProps> = ({
  visible,
  username,
  type,
  onClose,
  onSelectUser,
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && username) {
      fetchUserList();
    } else {
      setUsers([]);
    }
  }, [visible, username, type]);

  const fetchUserList = async () => {
    if (!username) return;
    setLoading(true);
    try {
      const endpoint = type === "followers" ? `/users/${username}/followers` : `/users/${username}/following`;
      const response = await api.get(endpoint);
      if (response.data && response.data.data) {
        setUsers(response.data.data);
      }
    } catch (err) {
      console.log(`Error fetching ${type}`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFollow = async (targetUsername: string, isFollowing: boolean) => {
    setUsers((prev) =>
      prev.map((u) => (u.username === targetUsername ? { ...u, is_following: !isFollowing } : u))
    );

    try {
      let response;
      if (isFollowing) {
        response = await api.delete(`/users/${targetUsername}/follow`);
      } else {
        response = await api.post(`/users/${targetUsername}/follow`);
      }
      const confirmedIsFollowing =
        response.data?.data?.is_following ?? !isFollowing;
      setUsers((prev) =>
        prev.map((u) =>
          u.username === targetUsername
            ? { ...u, is_following: confirmedIsFollowing }
            : u
        )
      );
    } catch (err) {
      console.log("Error toggling follow in modal", err);
      fetchUserList();
    }
  };

  if (!visible) return null;

  const { colors } = useTheme();
  const titleText = type === "followers" ? "팔로워" : "팔로잉";

  const renderItem = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity
        style={[styles.userCard, { borderBottomColor: colors.borderColor }]}
        activeOpacity={0.7}
        onPress={() => {
          if (item.is_admin) {
            showAdminProfilePrivateAlert();
            return;
          }
          onClose();
          if (onSelectUser) onSelectUser(item.username);
        }}
      >
        <View style={styles.userLeft}>
          <AdminAvatar user={item} style={styles.avatar} />
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.username, { color: colors.textPrimary }]}>{getDisplayName(item)}</Text>
              {item.is_admin && <AdminBadge />}
            </View>
            <Text style={[styles.fullName, { color: colors.textSecondary }]}>{item.full_name}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.followBtn, item.is_following && [styles.followingBtn, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, borderWidth: 1 }]]}
          onPress={() => handleToggleFollow(item.username, item.is_following)}
        >
          <Text style={[styles.followBtnText, item.is_following && { color: colors.textPrimary }]}>
            {item.is_following ? "팔로잉" : "팔로우"}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{titleText}</Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accentBlue} />
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {type === "followers" ? "팔로워가 없습니다." : "팔로잉하는 사용자가 없습니다."}
                </Text>
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
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  username: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  fullName: {
    color: "#8e8e8e",
    fontSize: 13,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  followingBtn: {
    backgroundColor: "#262626",
  },
  followBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  followingBtnText: {
    color: "#fff",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
  },
  emptyText: {
    color: "#8e8e8e",
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
});
