export type DisplayUser = {
  nickname?: string | null;
  username?: string | null;
  full_name?: string | null;
} | null | undefined;

export const getDisplayName = (user: DisplayUser, fallback = "사용자") =>
  user?.nickname?.trim() || user?.username?.trim() || fallback;

export const getDisplayInitial = (user: DisplayUser, fallback = "?") =>
  getDisplayName(user, fallback).charAt(0).toUpperCase();
