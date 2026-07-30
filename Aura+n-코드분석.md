# 🌈 Aura+n 프로젝트 코드 분석 보고서

> **분석일:** 2026년 7월 27일
> **프로젝트:** 인스타그램 클론 소셜 네트워크 애플리케이션
> **코드베이스:** FastAPI (Backend) + React Native / Expo (Frontend)

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [전체 아키텍처](#3-전체-아키텍처)
4. [백엔드 상세 분석](#4-백엔드-상세-분석)
5. [프론트엔드 상세 분석](#5-프론트엔드-상세-분석)
6. [데이터베이스 스키마](#6-데이터베이스-스키마)
7. [API 엔드포인트 총괄](#7-api-엔드포인트-총괄)
8. [인증 및 보안](#8-인증-및-보안)
9. [주요 기능별 분석](#9-주요-기능별-분석)
10. [강점 및 개선 제안](#10-강점-및-개선-제안)

---

## 1. 프로젝트 개요

**Aura+n**은 LGBTQ+ 커뮤니티를 타겟으로 한 인스타그램 스타일의 소셜 네트워크 서비스입니다. 일반적인 SNS 기능에 더해 익명 게시판, 커뮤니티 게시판, 성적 지향성/성별 프로필 설정 등 LGBTQ+ 커뮤니티에 특화된 기능을 제공합니다.

### 주요 특징
- **인스타그램 스타일 피드**: 사진/동영상 게시물, 좋아요, 댓글, 북마크, 리포스트
- **스토리 기능**: 24시간 후 사라지는 스토리 (인스타그램 스토리 유사)
- **커뮤니티 게시판**: 익명게시판, 정보게시판, 제휴업소 게시판
- **다이렉트 메시지**: 1:1 채팅, 메시지 요청 시스템
- **실시간 알림**: WebSocket 기반 실시간 알림
- **관리자 대시보드**: 서비스 통계, 사용자/게시물 관리
- **다크/라이트 테마** 지원
- **Google OAuth** 로그인 지원

---

## 2. 기술 스택

### 🔧 백엔드 (Backend)

| 기술 | 버전 | 용도 |
|------|------|------|
| **Python** | 3.12 | 언어 |
| **FastAPI** | ≥0.115.0 | 웹 프레임워크 (비동기) |
| **Uvicorn** | ≥0.30.6 | ASGI 서버 |
| **SQLAlchemy** | ≥2.0.35 | ORM (비동기 지원) |
| **AsyncPG** | ≥0.29.0 | PostgreSQL 비동기 드라이버 |
| **Alembic** | ≥1.13.0 | 데이터베이스 마이그레이션 |
| **Pydantic** | ≥2.9.2 | 데이터 검증 / 설정 관리 |
| **python-jose** | 3.3.0 | JWT 토큰 |
| **Passlib / bcrypt** | 1.7.4 / 4.0.1 | 비밀번호 해싱 |
| **Boto3** | ≥1.35.0 | AWS S3 연동 |
| **Pillow** | ≥10.4.0 | 이미지 처리 |
| **Redis** | ≥5.0.0 | 캐싱 |
| **PostgreSQL** | 16 | 데이터베이스 |

### 📱 프론트엔드 (Frontend)

| 기술 | 버전 | 용도 |
|------|------|------|
| **React Native** | 0.81.5 | 모바일 앱 프레임워크 |
| **Expo** | ~54.0.0 | RN 개발 도구 |
| **React** | 19.1.0 | UI 라이브러리 |
| **React Navigation** | 7.x | 네비게이션 (Stack + Bottom Tabs) |
| **Axios** | ^1.7.9 | HTTP 클라이언트 |
| **expo-linear-gradient** | ~15.0.8 | 그라데이션 UI |
| **AsyncStorage** | 2.2.0 | 로컬 저장소 |
| **expo-image-picker** | ~17.0.11 | 이미지 선택 |

### 🐳 인프라

- **Docker Compose**로 PostgreSQL + Redis 컨테이너 구성
- **Cloud Run** (GCP) 자동 배포 CI/CD (GitHub Actions)
- **Supabase Storage** 또는 **AWS S3**로 파일 업로드

---

## 3. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React Native / Expo)           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Auth     │  │ Theme    │  │ Notification│  Screens │         │
│  │ Context  │  │ Context  │  │ Context  │  │ (15개)   │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ API      │  │ Navigation  │ Components│                      │
│  │ Service  │  │ (Stack+Tab) │ (20+개)   │                      │
│  └──────────┘  └──────────┘  └──────────┘                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / WebSocket
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                          │
│                                                                │
│  ┌────────────┬────────────┬────────────┬────────────┐         │
│  │ Auth Module│ Posts      │ Users      │ Stories    │         │
│  │ (JWT)      │ Module     │ Module     │ Module     │         │
│  ├────────────┼────────────┼────────────┼────────────┤         │
│  │ Community  │ Direct Msg │ Notifictn  │ Hashtags   │         │
│  │ Module     │ Module     │ Module     │ Module     │         │
│  ├────────────┼────────────┼────────────┼────────────┤         │
│  │ Admin      │ Uploads    │            │            │         │
│  │ Module     │ Module     │            │            │         │
│  └────────────┴────────────┴────────────┴────────────┘         │
│                                                                │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Core: Config, Database, Security, Exceptions, Response     ││
│  └────────────────────────────────────────────────────────────┘│
└──────────────────────────┬─────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌────────────┐           ┌────────────┐
       │ PostgreSQL │           │   Redis    │
       │ (Main DB)  │           │  (Cache)   │
       └────────────┘           └────────────┘
```

### 계층 구조

```
backend/
├── app/
│   ├── main.py              # FastAPI 앱 진입점, 라우터 등록
│   ├── common/              # 공통 모듈
│   │   ├── exceptions.py    # 커스텀 예외 클래스
│   │   └── response.py      # 표준 응답 포맷 (ApiResponse)
│   ├── core/               # 핵심 설정
│   │   ├── config.py       # 환경 변수 설정
│   │   ├── database.py     # DB 연결 (async SQLAlchemy)
│   │   └── security.py     # 비밀번호 해싱, JWT 생성/검증
│   └── modules/            # 기능 모듈 (9개)
│       ├── auth/           # 인증 (회원가입, 로그인, JWT)
│       ├── users/          # 사용자 프로필, 팔로우, 차단
│       ├── posts/          # 게시물 CRUD, 좋아요, 댓글, 북마크
│       ├── stories/        # 스토리 (24시간 만료)
│       ├── community/      # 커뮤니티 게시판, 공지사항
│       ├── direct/         # 1:1 채팅, WebSocket
│       ├── notifications/  # 알림, WebSocket
│       ├── hashtags/       # 해시태그
│       ├── admin/          # 관리자 대시보드
│       └── uploads/        # 파일 업로드
```

---

## 4. 백엔드 상세 분석

### 4.1. Core 모듈

#### `config.py` - 환경 설정
- `pydantic-settings` 기반 설정 관리
- 주요 설정: DB URL, Redis URL, JWT 시크릿, AWS/Supabase 스토리지, CORS
- 중요: `database_url`은 기본값이 `localhost:5433` (Docker 매핑 포트)

#### `database.py` - 데이터베이스 연결
- `create_async_engine`으로 비동기 엔진 생성
- `async_sessionmaker`로 세션 팩토리
- `get_db()` 의존성 주입 함수: 요청마다 세션 생성 → 커밋 → 종료
- 풀 사이즈 10, 오버플로 20

#### `security.py` - 보안
- `passlib`의 `bcrypt` 방식으로 비밀번호 해싱
- `python-jose`로 JWT 생성/검증
- Access Token: 30분 만료
- Refresh Token: 7일 만료
- `_create_token()` 내부 함수로 Access/Refresh Token 생성

### 4.2. 공통 모듈

#### `exceptions.py` - 예외 처리
- `AppException` (HTTPException 상속)
- `NotFoundException` (404), `UnauthorizedException` (401), `ForbiddenException` (403)
- `ConflictException` (409), `BadRequestException` (400)
- 글로벌 예외 핸들러 `app_exception_handler`: JSON 표준 포맷 응답

#### `response.py` - 표준 응답
- `ApiResponse[T]` 제네릭 클래스: `{ data, meta, error }`
- `Meta`: `total`, `next_cursor`, `has_more` (페이지네이션)
- 정적 메서드: `ok()`, `paginated()`

### 4.3. 모듈별 분석

#### 🔐 Auth 모듈 (`/auth`)
- **모델**: `User` (사용자 ORM) — UUID PK, username/email 유니크
- **라우터 엔드포인트**:
  - `POST /auth/register` — 회원가입 (성별, 성적 지향성, 키, 체형 등 상세 정보)
  - `POST /auth/login` — 로그인 (email/username 모두 가능)
  - `POST /auth/refresh` — Access Token 갱신
  - `POST /auth/google` — Google OAuth 로그인
  - `GET /auth/me` — 내 정보 조회
- **특징**: 회원가입 시 `nickname`, `age`, `gender`, `sexual_orientation`, `height`, `body_type`, `profile_visibility` 등 상세 프로필 필드 제공

#### 👤 Users 모듈 (`/users`)
- **모델**: `Follow` (팔로우), `FollowRequest` (팔로우 요청), `UserBlock` (차단)
- **주요 엔드포인트**:
  - `GET /users/{username}` — 프로필 조회
  - `PATCH /users/me` — 프로필 수정
  - `POST /users/{username}/follow` — 팔로우
  - `DELETE /users/{username}/follow` — 언팔로우
  - `GET /users/{username}/followers` — 팔로워 목록
  - `GET /users/{username}/following` — 팔로잉 목록
  - `POST /users/{username}/block` — 사용자 차단
  - `PATCH /users/me/privacy` — 공개/비공개 설정
  - `PATCH /users/me/message-settings` — 메시지 수신 설정
  - `GET /users/me/follow-requests` — 팔로우 요청 목록
- **특징**: 비공개 계정의 경우 팔로우 요청/수락 시스템

#### 📸 Posts 모듈 (`/posts`)
- **모델**: `Post`, `PostMedia`, `PostLike`, `Comment`, `CommentLike`, `PostBookmark`, `PostRepost`, `PostReport`
- **주요 엔드포인트**:
  - `POST /posts` — 게시물 작성 (board_id로 커뮤니티 게시판 지정 가능)
  - `GET /posts/feed` — 메인 피드
  - `GET /posts/community` — 커뮤니티 게시판별 게시물
  - `GET /posts/{id}` — 게시물 상세
  - `PATCH /posts/{id}` — 게시물 수정
  - `DELETE /posts/{id}` — 게시물 삭제
  - `POST /posts/{id}/like` — 좋아요 토글
  - `POST /posts/{id}/bookmark` — 북마크 토글
  - `POST /posts/{id}/repost` — 리포스트 토글
  - `POST /posts/{id}/report` — 게시물 신고
  - `GET /posts/{id}/comments` — 댓글 목록
  - `POST /posts/{id}/comments` — 댓글 작성
  - `GET /users/{username}/posts` — 특정 사용자 게시물 목록
  - `GET /users/me/saved-posts` — 저장된 게시물
  - `GET /users/me/reposted-posts` — 리포스트한 게시물
- **특징**: `board_type`(anonymous/info)과 `board_id`로 커뮤니티 연동, 해시태그 추출/저장, 공개 범위(public/followers/private)

#### ⭕ Stories 모듈 (`/stories`)
- **모델**: `Story`, `StoryView`
- **엔드포인트**:
  - `POST /stories` — 스토리 작성
  - `GET /stories/feed` — 스토리 피드
  - `POST /stories/{id}/view` — 조회 처리
  - `DELETE /stories/{id}` — 스토리 삭제
- **특징**: 24시간 만료(expires_at), 중복 조회 방지(UniqueConstraint)

#### 🏛️ Community 모듈 (`/community`)
- **모델**: `CommunityBoard`, `CommunityNotice`
- **엔드포인트**:
  - `GET /community/boards` — 게시판 목록
  - `GET /community/notices` — 공지사항 목록
  - `POST /community/admin/boards` — 게시판 생성 (관리자)
  - `PATCH /community/admin/boards/{id}` — 게시판 수정
  - `POST /community/admin/boards/{id}/reorder` — 순서 변경
  - `DELETE /community/admin/boards/{id}` — 게시판 삭제
  - `POST /community/admin/notices` — 공지사항 등록
- **특징**: 부모 게시판(parent_id) 지원, 익명 게시판(is_anonymous) 지원

#### 💬 Direct 모듈 (`/direct`)
- **모델**: `ChatRoom`, `ChatRoomMember`, `ChatMessage`
- **엔드포인트**:
  - `POST /direct/rooms` — 채팅방 생성
  - `GET /direct/rooms` — 채팅방 목록
  - `GET /direct/requests` — 메시지 요청 목록
  - `POST /direct/rooms/{id}/accept` — 요청 수락
  - `POST /direct/rooms/{id}/reject` — 요청 거절
  - `POST /direct/rooms/{id}/block` — 채팅 차단
  - `GET /direct/rooms/{id}/messages` — 메시지 내역
  - `POST /direct/rooms/{id}/messages` — 메시지 전송
  - `POST /direct/rooms/{id}/read` — 읽음 처리
  - `WebSocket /direct/ws/{room_id}` — 실시간 채팅
- **특징**: `request_status` 시스템 (ACCEPTED/PENDING/REJECTED/BLOCKED), 메시지 타입(TEXT/IMAGE/VIDEO), 게시물 공유(shared_post_id)

#### 🔔 Notifications 모듈 (`/notifications`)
- **모델**: `Notification` (LIKE/COMMENT/FOLLOW/MENTION/DIRECT_MESSAGE)
- **엔드포인트**:
  - `GET /notifications` — 알림 목록
  - `GET /notifications/unread-count` — 읽지 않은 알림 개수
  - `PATCH /notifications/{id}/read` — 개별 읽음 처리
  - `PATCH /notifications/read-all` — 전체 읽음 처리
  - `WebSocket /notifications/ws` — 실시간 알림

#### #️⃣ Hashtags 모듈 (`/tags`)
- **모델**: `Hashtag`, `PostHashtag`
- **엔드포인트**:
  - `GET /tags/trending` — 트렌딩 해시태그
  - `GET /tags/search` — 해시태그 검색
  - `GET /tags/{name}/posts` — 해시태그별 게시물

#### 🛡️ Admin 모듈 (`/admin`)
- **엔드포인트**:
  - `GET /admin/stats` — 종합 통계 (사용자, 게시물, 댓글 수 등)
  - `GET /admin/users` — 사용자 목록/검색
  - `PATCH /admin/users/{id}/toggle-active` — 계정 활성화/정지
  - `GET /admin/posts` — 게시물 모니터링
  - `DELETE /admin/posts/{id}` — 게시물 강제 삭제

#### 📤 Uploads 모듈 (`/uploads`)
- `POST /uploads` — 파일 업로드 (Supabase Storage 또는 로컬 저장)

---

## 5. 프론트엔드 상세 분석

### 5.1. 앱 구조 (App.js)

```
App
├── GestureHandlerRootView
│   └── SafeAreaProvider
│       └── ThemeProvider (다크/라이트 테마)
│           └── AuthProvider (인증 상태 관리)
│               └── AppInner
│                   ├── StatusBar
│                   └── RootNavigator
```

### 5.2. 네비게이션 구조

#### Stack Navigator (Root)
```
[인증 없음]
├── LoginScreen
└── RegisterScreen

[인증 있음]
├── MainTabs (Bottom Tab Navigator)
│   ├── Feed (FeedStack Navigator)
│   │   ├── FeedHome → FeedScreen
│   │   └── Community → CommunityScreen
│   ├── Search → SearchScreen
│   ├── CreatePost → CreatePostScreen
│   ├── Messages → DirectMessageScreen
│   └── Profile → ProfileScreen
├── UserProfile → UserProfileScreen
├── EditProfile → EditProfileScreen
├── DirectMessage → DirectMessageScreen
├── ChatRoom → ChatRoomScreen
├── Notification → NotificationScreen
├── Hashtag → HashtagScreen
├── Admin → AdminScreen
└── CommunityAdmin → CommunityAdminScreen
```

### 5.3. 컨텍스트 (Context)

#### AuthContext
- `user`, `token`, `isLoading` 상태 관리
- `login()`, `register()`, `logout()`, `refreshProfile()` 메서드
- AsyncStorage에 access_token/refresh_token 저장
- 앱 시작 시 저장된 토큰으로 자동 로그인 (3초 스플래시)

#### ThemeContext
- `theme` (dark/light) 모드 관리
- AsyncStorage에 사용자 선호 테마 저장
- `toggleTheme()`, `setThemeMode()` 메서드
- `colors` 객체로 모든 테마 색상 제공

#### NotificationContext
- 실시간 WebSocket 알림 수신
- `unreadCount`, `toastNotification` 상태
- 알림 토스트 표시/자동 닫힘

### 5.4. API 서비스 (api.ts)
- Axios 인스턴스 생성 (baseURL: API_BASE_URL)
- **Request Interceptor**: AsyncStorage에서 토큰 읽어 Bearer 헤더 추가
- **Response Interceptor**: 401 발생 시 Refresh Token으로 자동 갱신

### 5.5. 화면별 주요 기능

| 화면 | 주요 기능 |
|------|----------|
| **LoginScreen** | 이메일/사용자명 + 비밀번호 로그인 |
| **RegisterScreen** | 상세 회원가입 (나이, 성별, 성적 지향성, 키, 체형, 자기소개) |
| **FeedScreen** | 메인 피드, 스토리 바, 좋아요/댓글/북마크/리포스트/SendDM |
| **SearchScreen** | 사용자/해시태그 검색, 탐색 피드 |
| **CreatePostScreen** | 게시물 작성 (미디어 업로드, 캡션, 위치) |
| **ProfileScreen** | 내 프로필 (게시물/저장/리포스트 탭), 테마 전환, 관리자 버튼 |
| **UserProfileScreen** | 타 사용자 프로필, 팔로우/언팔로우, DM 시작 |
| **EditProfileScreen** | 프로필 수정 |
| **CommunityScreen** | 익명/정보/제휴업소 게시판, 게시글 CRUD, 서브 카테고리 |
| **DirectMessageScreen** | 채팅방 목록 (수락/대기/차단) |
| **ChatRoomScreen** | 1:1 채팅, 게시물 공유 |
| **AdminScreen** | 통계 대시보드, 사용자/게시물 관리 |
| **CommunityAdminScreen** | 게시판 생성/수정/삭제/순서변경, 공지사항 관리 |
| **HashtagScreen** | 해시태그 게시물 목록 |
| **NotificationScreen** | 알림 내역 |

### 5.6. 주요 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| **PostCarousel** | 게시물 이미지 캐러셀 (좌우 스와이프) |
| **CommentsModal** | 댓글/대댓글 모달 |
| **PostDetailModal** | 게시물 상세 팝업 |
| **StoryBar** | 스토리 링 (프로필 원형 이미지) |
| **StoryViewerModal** | 스토리 시청 (좌우 스와이프) |
| **CreateStoryModal** | 스토리 작성 |
| **NotificationsModal** | 알림 팝업 |
| **SendPostDmModal** | 게시물 DM 공유 |
| **HashtagText** | 해시태그 하이라이팅 텍스트 |
| **AuraLogoText** | Aura+n 로고 |
| **ImageDetailViewerModal** | 이미지 확대 뷰어 |
| **UserListModal** | 팔로워/팔로잉 목록 |
| **FollowRequestsModal** | 팔로우 요청 목록 |
| **SplashScreen** | 스플래시 화면 |
| **NotificationToast** | 상단 알림 토스트 |

### 5.7. 테마 시스템

```typescript
interface ThemeColors {
  bgPrimary, bgSecondary, bgCard, bgInput,     // 배경색
  borderColor, borderLight,                     // 테두리색
  textPrimary, textSecondary, textMuted,        // 글자색
  accentBlue, accentPurple, accentPink, accentCyan, // 강조색
  auraGradient: [보라, 핑크, 시안],              // 시그니처 그라데이션
  tabBarBg, headerBg, modalBg,                  // 특수 UI 색상
  chatBubbleSelf, chatBubbleOther,              // 채팅 버블
  statusBarStyle                                // StatusBar 스타일
}
```

---

## 6. 데이터베이스 스키마

### 전체 테이블 목록 (18개)

| 테이블 | 설명 | 주요 필드 |
|--------|------|----------|
| `users` | 사용자 | username, email, full_name, nickname, age, gender, sexual_orientation(s), height, body_type, bio, profile_image_url, google_id, is_admin, is_private, profile_visibility |
| `posts` | 게시물 | user_id, title, board_type, board_id, caption, location, visibility |
| `post_media` | 게시물 미디어 | post_id, media_url, media_type, order |
| `post_likes` | 좋아요 | user_id, post_id [Unique] |
| `comments` | 댓글 | user_id, post_id, parent_id (대댓글), content |
| `comment_likes` | 댓글 좋아요 | user_id, comment_id [Unique] |
| `post_bookmarks` | 북마크 | user_id, post_id [Unique] |
| `post_reposts` | 리포스트 | user_id, post_id [Unique] |
| `post_reports` | 신고 | reporter_id, post_id, reason |
| `follows` | 팔로우 | follower_id, following_id [Unique] |
| `follow_requests` | 팔로우 요청 | requester_id, target_id, status [Unique] |
| `user_blocks` | 차단 | blocker_id, blocked_id [Unique] |
| `stories` | 스토리 | user_id, media_url, media_type, expires_at |
| `story_views` | 스토리 조회 | story_id, user_id [Unique] |
| `chat_rooms` | 채팅방 | is_group, name, request_status |
| `chat_room_members` | 채팅방 멤버 | room_id, user_id [Unique], last_read_at |
| `chat_messages` | 메시지 | room_id, sender_id, content, message_type, media_url, shared_post_id |
| `notifications` | 알림 | recipient_id, sender_id, type, message, post_id, is_read |
| `hashtags` | 해시태그 | name [Unique] |
| `post_hashtags` | 게시물-해시태그 | post_id, hashtag_id [Unique] |
| `community_boards` | 커뮤니티 게시판 | name, slug [Unique], parent_id, is_anonymous, is_active, sort_order |
| `community_notices` | 공지사항 | board_id, title, content |

### 마이그레이션 현황

Alembic으로 총 **18개**의 마이그레이션 파일이 생성되어 있습니다:

1. `20260723_1212` - Users 테이블 생성
2. `20260723_1225` - Posts, PostMedia 테이블 생성
3. `20260723_1307` - PostLikes, Comments 테이블 생성
4. `20260723_1330` - PostBookmarks 테이블 생성
5. `20260723_1500` - Stories, StoryViews 테이블 생성
6. `20260723_1523` - CommentReplies, CommentLikes 추가
7. `20260724_0100` - ChatRooms, ChatMessages 테이블 생성
8. `20260724_0200` - Carousel, Hashtags, Private, Blocks, Reports 추가
9. `20260724_0300` - Posts에 visibility 추가
10. `20260725_0000` - Users에 google_id 추가
11. `20260726_1232` - Posts에 title, board_type 추가
12. `20260726_1500` - Profile fields to users
13. `20260726_1600` - Signup identity fields
14. `20260726_1700` - DM request policy
15. `20260726_1800` - Community boards
16. `20260726_1900` - Anonymous board categories

---

## 7. API 엔드포인트 총괄

### 전체 API: 약 70+개 엔드포인트

| 모듈 | Prefix | 엔드포인트 수 | 주요 기능 |
|------|--------|--------------|----------|
| Auth | `/api/v1/auth` | 5 | 회원가입, 로그인, 토큰 갱신, Google OAuth |
| Users | `/api/v1/users` | 14 | 프로필 CRUD, 팔로우/언팔로우, 차단, 설정 |
| Posts | `/api/v1/posts` | 18+ | 게시물 CRUD, 좋아요, 댓글, 북마크, 리포스트, 신고 |
| Stories | `/api/v1/stories` | 4 | 스토리 CRUD, 조회 처리 |
| Community | `/api/v1/community` | 7 | 게시판 CRUD, 공지사항, 순서 변경 |
| Direct | `/api/v1/direct` | 9+ | 채팅방, 메시지, WebSocket |
| Notifications | `/api/v1/notifications` | 5+ | 알림 목록, 읽음 처리, WebSocket |
| Hashtags | `/api/v1/tags` | 3 | 해시태그 검색, 트렌딩 |
| Admin | `/api/v1/admin` | 5 | 통계, 사용자/게시물 관리 |
| Uploads | `/api/v1/uploads` | 1 | 파일 업로드 |
| Health | `/health` | 1 | 서버 상태 체크 |

---

## 8. 인증 및 보안

### JWT 인증 흐름

```
1. 로그인 → 서버가 Access Token(30분) + Refresh Token(7일) 발급
2. 모든 API 요청 시 Authorization: Bearer <access_token> 헤더
3. Access Token 만료(401) → Refresh Token으로 자동 갱신
4. Refresh Token도 만료 → 재로그인 필요
```

### 보안 관련 특징

- **비밀번호**: bcrypt 해싱 (passlib)
- **JWT**: HS256 알고리즘, 만료 시간 설정
- **Token 갱신**: Axios 인터셉터에서 401 발생 시 자동 Refresh
- **권한**: `is_admin` 플래그로 관리자 기능 제한
- **비공개 계정**: 팔로우 요청/수락 시스템
- **게시물 공개 범위**: public / followers / private 3단계
- **제휴업소 게시판**: 관리자만 게시물 작성 가능

### 보안 취약점 및 개선 필요 사항

- `secret_key`가 기본값(`change-this-secret-key`) 그대로 사용되고 있음
- `allow_origin_regex=r".*"`로 모든 오리진 허용 (프로덕션에서는 제한 필요)
- HTTPS 강제 리다이렉션 없음

---

## 9. 주요 기능별 분석

### 9.1. 커뮤니티 게시판 시스템

커뮤니티 기능이 3개 섹션으로 나뉘어 있습니다:

1. **익명게시판** (`is_anonymous=true`)
   - 서브 카테고리: 고민상담, 연애·관계, 일상, 커밍아웃
   - 작성자 이름이 "익명"으로 표시
   - 아바타 대신 👁️ 아이콘

2. **정보게시판** (`is_anonymous=false`)
   - 실제 사용자 이름 표시
   - 상단에 "도움이 필요할 때" 지원 카드 UI

3. **제휴업소 게시판** (slug에 "partner" 포함)
   - 관리자만 게시물 작성 가능
   - 일반 사용자는 읽기 전용

### 9.2. 다이렉트 메시지 시스템

- **메시지 요청 시스템**: 비팔로워가 DM을 보낼 때 요청 상태(PENDING)
- **수락/거절/차단**: 채팅방 단위로 관리
- **WebSocket**: 실시간 메시지 전송
- **게시물 공유**: `shared_post_id`로 특정 게시물 공유 가능
- **읽음 처리**: `last_read_at`으로 마지막 읽은 시간 관리

### 9.3. 스토리 시스템

- 24시간 만료 (expires_at = created_at + 24h)
- 중복 조회 방지 (story_id + user_id UniqueConstraint)
- 스토리 시청자 목록 조회
- 내 스토리 그리드 모달 (MyStoriesGridModal)

### 9.4. 알림 시스템

- **알림 타입**: LIKE, COMMENT, FOLLOW, MENTION, DIRECT_MESSAGE
- **실시간 전송**: WebSocket (`/notifications/ws`)
- **읽음 처리**: 개별/전체 읽음 처리
- **토스트 알림**: 상단에 잠시 표시 후 자동 사라짐
- **뱃지**: 탭바에 읽지 않은 알림 개수 표시

### 9.5. 관리자 시스템

- **통계 대시보드**: 총 사용자, 활성 계정, 게시글, 댓글, 스토리 수
- **사용자 관리**: 검색, 계정 활성화/정지
- **게시물 관리**: 전체 게시물 모니터링, 강제 삭제
- **커뮤니티 관리**: 게시판 생성/수정/삭제/순서변경, 공지사항 관리

---

## 10. 강점 및 개선 제안

### 🏆 강점 (Strengths)

1. **완성도 높은 기능 구현**
   - 인스타그램의 핵심 기능(피드, 스토리, DM, 알림)을 모두 구현
   - LGBTQ+ 커뮤니티 특화 기능 (성적 지향성, 익명 게시판 등)

2. **모듈식 아키텍처**
   - 백엔드가 기능별 모듈로 잘 분리되어 있음
   - 각 모듈이 models / schemas / router / service로 명확히 구분

3. **일관된 응답 포맷**
   - `ApiResponse` 제네릭 클래스로 모든 응답 통일
   - 예외 처리도 일관된 JSON 포맷

4. **비동기 처리**
   - FastAPI + AsyncPG로 비동기 DB 연결
   - WebSocket으로 실시간 기능 지원

5. **자동화된 인프라**
   - Docker Compose로 로컬 개발 환경 구성
   - GitHub Actions로 Cloud Run 자동 배포 CI/CD

6. **풍부한 UI/UX**
   - 다크/라이트 테마 지원
   - Aura 시그니처 그라데이션 디자인
   - 직관적인 네비게이션 구조

7. **데이터베이스 마이그레이션**
   - Alembic으로 체계적인 스키마 버전 관리

### 🔧 개선 제안 (Areas for Improvement)

#### P1 — 보안 강화
- [ ] `secret_key`를 환경 변수로 관리하고 기본값 제거
- [ ] CORS 설정을 프로덕션 환경에 맞게 제한
- [ ] HTTPS 강제 리다이렉션 추가
- [ ] Rate Limiting 도입 (로그인, 게시물 작성 등)
- [ ] 입력값 Sanitization 강화

#### P2 — 코드 품질
- [ ] 타입스크립트 strict 모드 활성화
- [ ] 백엔드 테스트 코드 작성 (현재 테스트 코드 없음)
- [ ] 프론트엔드 API 호출 중복 로직 제거 (커스텀 훅으로 리팩토링)
- [ ] 에러 처리 통일 (프론트엔드 try-catch 중복)
- [ ] 환경 변수 `.env.example` 파일 추가

#### P3 — 기능 개선
- [ ] 이미지 업로드 최적화 (썸네일 생성, CDN 연동)
- [ ] 검색 기능 고도화 (Elasticsearch 등)
- [ ] 푸시 알림 추가 (FCM/APNs)
- [ ] 인피니트 스크롤 페이지네이션 최적화
- [ ] 오프라인 모드 지원

#### P4 — 성능 최적화
- [ ] Redis 캐싱 적극 활용 (피드 캐시, 해시태그 트렌딩)
- [ ] DB 쿼리 최적화 (N+1 문제 검토)
- [ ] 프론트엔드 이미지 Lazy Loading
- [ ] API 응답 데이터 경량화 (선택적 필드)

#### P5 — 개발 경험
- [ ] Pre-commit hooks (lint, format)
- [ ] API 문서 자동화 (Swagger UI는 있으나 더 상세한 설명 필요)
- [ ] Storybook으로 컴포넌트 문서화
- [ ] 통합 테스트 환경 구축

---

## 📊 프로젝트 규모 요약

| 항목 | 수치 |
|------|------|
| 백엔드 Python 파일 | 30+개 |
| 프론트엔드 TSX 파일 | 30+개 |
| 데이터베이스 테이블 | 22개 |
| API 엔드포인트 | 70+개 |
| Alembic 마이그레이션 | 18개 |
| 프론트엔드 화면 | 15개 |
| 프론트엔드 컴포넌트 | 20+개 |
| 주요 의존성 (백엔드) | 15개 |
| 주요 의존성 (프론트엔드) | 20개 |

---

## 📝 결론

**Aura+n** 프로젝트는 FastAPI와 React Native를 활용하여 인스타그램을 모델로 한 완성도 높은 소셜 네트워크 애플리케이션입니다. LGBTQ+ 커뮤니티를 타겟으로 한 차별화된 기능(익명 게시판, 상세 프로필 설정 등)이 잘 구현되어 있으며, 모듈식 아키텍처와 일관된 코드 스타일이 유지보수를 용이하게 합니다.

실시간 채팅(WebSocket), 알림, 스토리, 관리자 대시보드 등 복잡한 기능들이 안정적으로 구현되어 있으며, 향후 보안 강화와 테스트 코드 추가를 통해 더욱 견고한 서비스로 발전할 수 있을 것으로 보입니다.
