# 수정 계획 요약

## 전체 문제 개요
현재 **Instagram Clone (Aura+) React Native Frontend** 프로젝트는 기능 구현이 되어 있으나, 다음과 같은 구조적·성능적 문제가 확인되었습니다.
1. **401 토큰 자동 갱신 레이스 조건 및 세션 손실 위험**: [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)에서 동시 다발적 401 발생 시 토큰 갱신 요청이 중복되어 로그인 세션이 무효화될 가능성이 있습니다.
2. **배터리/네트워크 과소비 및 불필요한 전역 리렌더링**: [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx)에서 5초 주기 `setInterval` Polling과 WebSocket 수신이 동시에 동작하며, Context Provider Value가 메모이제이션되지 않아 전체 화면 렌더링 폭포 현상이 유발됩니다.
3. **거대 화면 컴포넌트의 단일 책임 원칙(SRP) 위배**: [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx) (1,592줄), [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx) (1,126줄) 등의 파일에 API 호출, 8개 이상의 모달 제어, 피드/스토리 상태, UI JSX가 모두 섞여 있어 유지보수를 심각하게 방해하고 있습니다.
4. **타입 안전성 결여 및 성능 최적화 미비**: 프로젝트 전반 160건 이상의 `: any` 남발 및 `React.memo` / FlatList 최적화 속성 미적용으로 인한 프레임 드랍이 관찰됩니다.

## 가장 위험한 항목
- **401 토큰 자동 갱신 요청의 무한 루프 및 레이스 조건**: 여러 API가 동시에 401 응답을 받을 때 Refresh Token 요청이 병렬로 전송되어 서버에서 Refresh Token이 이미 사용됨(Revoked)으로 처리되고 로그인 세션이 예기치 않게 유실될 위험이 높습니다.

## 지금 당장 수정하지 말아야 할 항목
- **프로젝트 폴더 구조 전체 재구성 (Feature-driven 디렉터리 대규모 이동)**: 기존 import 경로 손상 및 의존성 이탈 위험이 매우 큽니다.
- **백엔드 Database 스키마 및 Supabase RLS 정책 변경**: 백엔드 API와의 계약 검증 없이 프론트엔드 임의 판단으로 DB/RLS 변경을 시도하면 데이터 무결성이 손상될 수 있습니다.
- **단순 코드 미관 목적의 파일 통합/분할**: 실익이 없는 리팩터링은 배제합니다.

## 권장 작업 순서
1. 보안 및 데이터 손실 위험 (401 Refresh Token Queue)
2. 실제 버그 (Notification Polling & Realtime 중복 처리)
3. API 및 데이터 계약 (API Service 추상화)
4. 기능별 책임 분리 (거대 Screen 컴포넌트 단계적 서브 모듈화)
5. 상태 관리와 실시간 구독 (Context 메모이제이션)
6. UI 및 UX (FlatList 최적화 및 React.memo)
7. Git 및 문서 (환경 변수 및 프로젝트 설정 문서화)
8. 선택적 리팩터링 (TypeScript Strict 타입 적용)

---

# 단계별 수정 계획

## 작업 1: 401 토큰 자동 갱신 요청 무한 루프 및 레이스 조건 방지 큐(Queue) 도입

- **목적**: 동시 401 Unauthorized 에러 발생 시 토큰 갱신 요청 중복을 방지하고 로그인 세션 유실 방지
- **현재 상태**: [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)에서 `originalRequest._retry` 플래그로 단순 재시도만 막고 있으며, 동시에 발생한 N개의 API 요청이 각각 독립적으로 `/auth/refresh`를 호출합니다.
- **확인된 문제**: 병렬 401 요청 시 첫 번째 Refresh 요청 성공 후 두 번째 Refresh 요청이 구 토큰으로 전송되어 실패하고, 결국 AsyncStorage의 토큰이 삭제되어 유저가 튕기는 현상 발생 위험.
- **근거가 되는 파일**: [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)
- **변경 대상 파일**: [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)
- **새로 만들 파일**: 없음 (필요 시 `src/services/tokenQueue.ts` 보류)
- **이동하거나 분리할 책임**: Refresh Token 요청 진행 상태 관리 및 실패한 요청 큐잉(Subscriber Queue) 책임.
- **그대로 유지할 책임**: Axios 인스턴스 기본 설정 (`baseURL`, `timeout`, Request Interceptor).
- **유지해야 할 공개 인터페이스**: `export default api` (기존 `api.get`, `api.post` 인터페이스 동일 유지).
- **변경하지 말아야 할 파일**: [AuthContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/AuthContext.tsx)
- **영향받는 기능**: 앱 전체 API 통신 및 인증 세션 유지.
- **예상 부작용**: Refresh Token 자체가 만료되었을 경우 정확한 로그아웃 처리가 되어야 하며, 큐 대기 중인 요청들의 reject 처리가 누락되지 않아야 함.
- **의존성**: 없음.
- **선행 작업**: 없음.
- **검증 방법**: Access Token을 강제로 만료시킨 후 피드/프로필/스토리 등 5개 이상의 API를 동시 요청하여 `/auth/refresh`가 단 1회만 실행되고 모든 요청이 성공하는지 확인.
- **회귀 테스트 항목**: 토큰 만료 후 자동으로 Access Token 갱신 성공 여부, Refresh Token 만료 시 정상 로그인 화면 이동 여부.
- **롤백 방법**: `git checkout -- frontend/src/services/api.ts`
- **우선순위**: **필수**
- **위험도**: **중간**
- **예상 변경 규모**: **작음**
- **구현 순서**: 1
- **완료 조건**: 동시에 N개 API 요청 중 401 발생 시 토큰 갱신 API가 1회만 호출되고 실패 요청들이 재시도되어 정상 응답 수신.

---

## 작업 2: Notification Polling 낭비 및 실시간 중복 트리거 방지

- **목적**: 5초 주기 Polling으로 인한 불필요한 네트워크/배터리 소모 및 WebSocket 메시지와의 중복 알림 토스트 방지
- **현재 상태**: [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx)에서 `setInterval` (5000ms)로 unread count를 조회하면서 동시에 WebSocket `subscribeWebSocket`을 실행합니다.
- **확인된 문제**: WebSocket으로 실시간 알림을 이미 수신했음에도 5초 폴링이 실행되어 중복 렌더링 및 네트워크 낭비 발생.
- **근거가 되는 파일**: [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx), [notifications.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/notifications.ts)
- **변경 대상 파일**: [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx)
- **새로 만들 파일**: 없음.
- **이동하거나 분리할 책임**: Polling 주기 조정 (예: WebSocket 연결 시 Polling 비활성화 또는 간격 연장) 및 중복 Toast 방지 ID 대조 책임.
- **그대로 유지할 책임**: `useNotification()` 훅 인터페이스 (`notifications`, `unreadCount`, `markAsRead` 등).
- **유지해야 할 공개 인터페이스**: `NotificationProvider`, `useNotification`
- **변경하지 말아야 할 파일**: [NotificationToast.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/NotificationToast.tsx)
- **영향받는 기능**: 알림 배지 카운트, 상단 알림 토스트, NotificationsModal.
- **예상 부작용**: WebSocket 백그라운드 끊김 시 폴링 폴백(Fallback) 동작이 유지되어야 함.
- **의존성**: 작업 1.
- **선행 작업**: 작업 1.
- **검증 방법**: 웹소켓 수신 시 실시간 알림 표시 및 5초 주기 폴링 네트워크 탭 점검.
- **회귀 테스트 항목**: 알림 읽음 처리 시 카운트 차감 및 백그라운드 복귀 시 알림 동기화 여부.
- **롤백 방법**: `git checkout -- frontend/src/services/notifications.ts frontend/src/context/NotificationContext.tsx`
- **우선순위**: **필수**
- **위험도**: **낮음**
- **예상 변경 규모**: **작음**
- **구현 순서**: 2
- **완료 조건**: WebSocket 정상 동작 시 주기적 5초 네트워크 요청이 과도하게 발생하지 않고 알림이 정확히 1회만 수신됨.

---

## 작업 3: Context Value 메모이제이션으로 전역 리렌더링 연쇄 차단

- **목적**: Context Provider의 `value` 객체를 `useMemo`로 감싸 유관 상태 변경 시에만 하위 컴포넌트가 렌더링되도록 개선
- **현재 상태**: [AuthContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/AuthContext.tsx) (207줄), [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx) (155줄), [ThemeContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/ThemeContext.tsx)에서 `value={{ ... }}` 객체가 렌더링 시마다 새로운 객체 참조로 할당됨.
- **확인된 문제**: `AuthProvider` 또는 `NotificationProvider` 내부의 사소한 상태 변경(예: loading 플래그) 시 Provider를 구독하는 전체 화면(`FeedScreen`, `RootNavigator` 등)이 매번 다시 렌더링됨.
- **근거가 되는 파일**: [AuthContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/AuthContext.tsx), [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx), [ThemeContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/ThemeContext.tsx)
- **변경 대상 파일**: [AuthContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/AuthContext.tsx), [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx), [ThemeContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/ThemeContext.tsx)
- **새로 만들 파일**: 없음.
- **이동하거나 분리할 책임**: Context Value 객체 생성 시 `useMemo` 적용 및 함수 메소드들에 `useCallback` 적용.
- **그대로 유지할 책임**: Context State 종류 및 Provider 래핑 구조.
- **유지해야 할 공개 인터페이스**: `useAuth()`, `useNotification()`, `useTheme()` 반환 타입 및 메소드 명.
- **변경하지 말아야 할 파일**: [App.js](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/App.js)
- **영향받는 기능**: 앱 전반 렌더링 성능.
- **예상 부작용**: 의존성 배열 누락 시 상태 업데이트가 구독 컴포넌트에 반영되지 않을 수 있으므로 정확한 `useMemo` 의존성 작성 필요.
- **의존성**: 작업 2.
- **선행 작업**: 작업 2.
- **검증 방법**: React Developer Tools Profiler를 사용하여 Auth/Notification 상태 변경 시 하위 비관련 컴포넌트 불필요 렌더링 횟수 비교.
- **회귀 테스트 항목**: 로그인/로그아웃/테마 변경/알림 갱신 시 상태가 화면에 정상 업데이트되는지 확인.
- **롤백 방법**: `git checkout -- frontend/src/context/`
- **우선순위**: **필수**
- **위험도**: **낮음**
- **예상 변경 규모**: **작음**
- **구현 순서**: 3
- **완료 조건**: Context Provider 하위 컴포넌트들이 부모 상태 변경 시 불필요하게 렌더링되지 않음.

---

## 작업 4: AdminScreen (1,592줄) 탭별 컴포넌트 책임 분리

- **목적**: 1,592줄에 달하는 거대한 [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)를 탭 단위(Stats, Users, Posts, Activity, Reports)로 분리하여 유지보수성 확보
- **현재 상태**: 단일 파일 내에 6개 탭의 모든 상태(`stats`, `users`, `posts`, `activityUsers`, `reports`), 모달 오픈 상태 5개, API 페칭 함수 10개 이상이 포함되어 있음.
- **확인된 문제**: 한 탭의 로직 수정 시 1,500줄 이상의 코드 내에서 예상치 못한 영역이 영향을 받을 수 있고 코드 변경 지점 파악이 불가능함.
- **근거가 되는 파일**: [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)
- **변경 대상 파일**: [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)
- **새로 만들 파일**:
  - `frontend/src/screens/admin/AdminStatsTab.tsx` (추가 확인 필요)
  - `frontend/src/screens/admin/AdminUsersTab.tsx` (추가 확인 필요)
  - `frontend/src/screens/admin/AdminPostsTab.tsx` (추가 확인 필요)
  - `frontend/src/screens/admin/AdminReportsTab.tsx` (추가 확인 필요)
- **이동하거나 분리할 책임**: 각 탭별 UI 렌더링 및 탭 전용 로컬 상태.
- **그대로 유지할 책임**: `AdminScreen` 메인 탭 전환 셸(Shell) 및 통용 팝업 모달 연동.
- **유지해야 할 공개 인터페이스**: `export const AdminScreen`
- **변경하지 말아야 할 파일**: [adminService.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/adminService.ts)
- **영향받는 기능**: 관리자 페이지(통계, 사용자 관리, 피드/커뮤니티 관리, 신고 처리).
- **예상 부작용**: 탭 전환 시 상태 유지 필요 여부에 따른 Props 전달 구조 주의.
- **의존성**: 작업 3.
- **선행 작업**: 작업 3.
- **검증 방법**: 관리자 화면 진입 후 Stats, Users, Posts, Activity, Reports 탭별 정상 동작 및 데이터 조회 테스트.
- **회귀 테스트 항목**: 유저 차단/해제, 게시글 삭제/숨김, 신고 처리 및 모달 호출 정상 작동 확인.
- **롤백 방법**: `git checkout -- frontend/src/screens/AdminScreen.tsx` 후 신규 탭 파일 삭제.
- **우선순위**: **필수**
- **위험도**: **중간**
- **예상 변경 규모**: **큼**
- **구현 순서**: 4
- **완료 조건**: `AdminScreen.tsx` 파일 크기가 400줄 이하로 축소되고 각 탭 파일이 독립 분리됨.

---

## 작업 5: FeedScreen (1,126줄) 메인 피드 로직 및 모달 상태 분리

- **목적**: [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx) 내에 강결합된 스토리 관리, 댓글/DM/신고/공지 모달 상태, API 페칭 로직을 분리
- **현재 상태**: `FeedScreen.tsx`에 피드 목록 조회, 스토리 조회/삭제, 댓글/DM/신고/스토리생성/공지 모달 제어 상태 9개 이상과 API 직접 호출 코드가 혼재함.
- **확인된 문제**: 렌더링 성능 저하 및 새로운 피드 관련 기능 추가 시 파일 복잡도 극대화.
- **근거가 되는 파일**: [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
- **변경 대상 파일**: [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
- **새로 만들 파일**: `frontend/src/hooks/useFeed.ts` (추가 확인 필요)
- **이동하거나 분리할 책임**: 피드/스토리 데이터 페칭 및 갱신 비즈니스 로직(Custom Hook 분리).
- **그대로 유지할 책임**: 메인 Feed UI 레이아웃 및 스크롤 핸들링.
- **유지해야 할 공개 인터페이스**: `export const FeedScreen`
- **변경하지 말아야 할 파일**: [PostCarousel.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/PostCarousel.tsx), [StoryBar.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/StoryBar.tsx)
- **영향받는 기능**: 메인 피드, 스토리 바, 게시글 좋아요/북마크/댓글/DM 공유.
- **예상 부작용**: 커스텀 훅 분리 시 렌더링 조건 및 데이터 업데이트 타이밍 불일치 주의.
- **의존성**: 작업 4.
- **선행 작업**: 작업 4.
- **검증 방법**: 피드 당겨서 새로고침(Pull-to-refresh), 스토리 조회, 좋아요/북마크/댓글 작성 동작 검증.
- **회귀 테스트 항목**: 피드 무한 스크롤, 스토리 삭제, 모달 정상 표시 확인.
- **롤백 방법**: `git checkout -- frontend/src/screens/FeedScreen.tsx`
- **우선순위**: **필수**
- **위험도**: **중간**
- **예상 변경 규모**: **중간**
- **구현 순서**: 5
- **완료 조건**: UI 렌더링과 데이터 페칭 로직이 분리되고, `FeedScreen.tsx` 코드 길이가 단축됨.

---

## 작업 6: FlatList Item Component 독립 추출 및 React.memo 적용

- **목적**: FeedScreen, SearchScreen, UserProfileScreen 등 주요 목록의 `renderItem` closure 함수를 메모이제이션된 독립 컴포넌트로 분리하여 스크롤 성능 향상
- **현재 상태**: [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx) (436줄 `renderPostItem`), [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx) (`renderSearchResultItem`), [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx) (`renderGridItem`) 등의 함수가 Screen 내부에 closure로 작성되어 있음.
- **확인된 문제**: 스크롤이나 부모 화면 리렌더링 시 목록의 모든 카드가 재렌더링되어 프레임 드랍 발생.
- **근거가 되는 파일**: [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx), [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx), [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx)
- **변경 대상 파일**: [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx), [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx), [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx)
- **새로 만들 파일**: `frontend/src/components/FeedPostCard.tsx` (추가 확인 필요)
- **이동하거나 분리할 책임**: 단일 게시글 Card UI 렌더링 및 클릭 이벤트 핸들링 책임.
- **그대로 유지할 책임**: FlatList data 및 keyExtractor, onEndReached 속성.
- **유지해야 할 공개 인터페이스**: Props 인터페이스 (item, onLike, onComment 등).
- **변경하지 말아야 할 파일**: [PostCarousel.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/PostCarousel.tsx)
- **영향받는 기능**: 피드 스크롤, 탐색 화면 검색 결과, 프로필 게시물 그리드.
- **예상 부작용**: `React.memo` 비교 함수 미작성 또는 Props로 인라인 함수 전달 시 메모이제이션 무효화 주의 (`useCallback` 함께 적용).
- **의존성**: 작업 5.
- **선행 작업**: 작업 5.
- **검증 방법**: React Native Performance Monitor로 피드 스크롤 시 60FPS 유지 여부 및 Re-render 횟수 측정.
- **회귀 테스트 항목**: 피드 좋아요 버튼 반응, 댓글 클릭, 작성자 프로필 이동 동작 확인.
- **롤백 방법**: `git checkout -- frontend/src/screens/`
- **우선순위**: **권장**
- **위험도**: **낮음**
- **예상 변경 규모**: **중간**
- **구현 순서**: 6
- **완료 조건**: FlatList renderItem이 독립 메모이제이션 컴포넌트로 추출되고 스크롤 성능이 개선됨.

---

## 작업 7: 프로젝트 환경 변수 및 실행/빌드 문서화 (README.md & .env.example)

- **목적**: 개발 환경 설정 및 백엔드/API URL 환경 변수 명세를 명확히 문서화하여 온보딩 및 유지보수 편의성 제고
- **현재 상태**: [frontend/src/config.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/config.ts)에 IP 및 URL 설정 로직이 존재하나 `.env.example` 및 구체적 설명 문서가 부재함.
- **확인된 문제**: 로컬/테스트 서버 변경 시 설정 방법 명세 부재.
- **근거가 되는 파일**: [config.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/config.ts), [app.json](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/app.json)
- **변경 대상 파일**: [README.md](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/README.md) (없을 경우 생성 필요)
- **새로 만들 파일**: `frontend/.env.example` (추가 확인 필요)
- **이동하거나 분리할 책임**: 환경 변수 설명 및 실행 가이드 문서 작성.
- **그대로 유지할 책임**: 소스 코드 및 기존 동작.
- **유지해야 할 공개 인터페이스**: 없음.
- **변경하지 말아야 할 파일**: [config.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/config.ts)
- **영향받는 기능**: 개발 환경 구성.
- **예상 부작용**: 없음.
- **의존성**: 없음.
- **선행 작업**: 없음.
- **검증 방법**: 새 환경에서 문서에 설명된 순서대로 프로젝트 설정 및 실행 가능 여부 점검.
- **회귀 테스트 항목**: 기존 앱 동작에 영향 없음.
- **롤백 방법**: 생성된 문서 파일 삭제.
- **우선순위**: **권장**
- **위험도**: **낮음**
- **예상 변경 규모**: **작음**
- **구현 순서**: 7
- **완료 조건**: `.env.example` 작성 및 README에 빌드/실행 환경 구성 가이드 포함.

---

# 작업 분류

## 1. 즉시 수행해도 안전한 작업
- **작업 1**: 401 토큰 자동 갱신 요청 무한 루프 및 레이스 조건 방지 큐(Queue) 도입
- **작업 2**: Notification Polling 낭비 및 실시간 중복 트리거 방지
- **작업 3**: Context Value 메모이제이션으로 전역 리렌더링 연쇄 차단
- **작업 7**: 프로젝트 환경 변수 및 실행/빌드 문서화 (`.env.example` 등)

## 2. 기능 완성 후 수행할 작업
- **작업 4**: `AdminScreen.tsx` (1,592줄) 탭별 컴포넌트 책임 분리
- **작업 5**: `FeedScreen.tsx` (1,126줄) 메인 피드 로직 및 모달 상태 분리
- **작업 6**: FlatList Item Component 독립 추출 및 `React.memo` 적용

## 3. 현재는 수행하지 말아야 할 작업
- **전체 폴더 구조 대규모 변경 (Full Feature-driven Refactoring)**: 수십 개 파일의 import 경로가 변경되어 대규모 파손 위험이 있습니다.
- **FastAPI / Supabase DB RLS 및 테이블 스키마 변경**: 프론트엔드 변경 범위를 벗어나며 서버/데이터베이스 계약 검증 전 수행 금지입니다.
- **기존 작동 중인 API 호출부 라이브러리 전면 교체 (예: TanStack Query 완전 전환)**: 기존 비동기 상태 관리와의 비동등성으로 인한 사이드 이펙트 위험이 큽니다.

---

# 승인 단위

### [승인 단위 1] 인증 토큰 세션 안정화 및 401 Queue 처리
- **포함 작업**: 작업 1
- **목적**: 401 발생 시 자동 갱신 세션 유실 방지.
- **독립 검증**: 토큰 만료 후 병렬 요청 시 1회만 토큰 갱신 후 정상 재시도되는지 확인.

### [승인 단위 2] 알림 성능 및 Context 메모이제이션 최적화
- **포함 작업**: 작업 2, 작업 3
- **목적**: 전역 렌더링 폭포 현상 차단 및 알림 Polling 네트워크 자원 절약.
- **독립 검증**: React DevTools Profiler로 Provider 상태 변경 시 불필요한 리렌더링 차단 확인.

### [승인 단위 3] 거대 화면 컴포넌트 (AdminScreen / FeedScreen) 단계적 모듈화
- **포함 작업**: 작업 4, 작업 5, 작업 6
- **목적**: 단일 파일 책임 분리 및 60FPS 스크롤 성능 확보.
- **독립 검증**: 각 화면 탭 기능 및 피드 스크롤 정상 동작 확인.

---

# 추가 확인이 필요한 항목

1. **Supabase Realtime 및 backend DB RLS 정책 문서**:
   - 프론트엔드 `features/direct/supabaseRealtime.ts`에서 Supabase Realtime 채널을 직접 구독하고 있으나, 백엔드 Python FastAPI DB(`app.db`) 및 Supabase 테이블 RLS 권한과의 세부 동기화 명세 추가 확인 필요.
2. **Push Notification 서버Receipt 동기화 API 동작**:
   - `services/pushNotifications.ts`에서 `/notifications/push-tokens/sync-receipts` 호출이 포함되어 있으나 실제 푸시 토큰 만료 시 세션 처리 응답값 명세 확인 필요.
3. **탈퇴 유예 기간 유저 세션 가드 (`withdrawal_token`)**:
   - `AuthContext.tsx`에서 `withdrawal_token` 처리 시 AsyncStorage 조회가 분기문으로 들어가 있어 실제 서버의 탈퇴 취소 API (`/auth/withdraw/cancel`)와의 에러 핸들링 추가 확인 필요.

---

아직 코드는 수정하지 않았으며, 위 계획 중 사용자가 승인한 작업만 한 단계씩 구현해야 합니다.
