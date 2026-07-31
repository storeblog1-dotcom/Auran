# React Native 아키텍처 진단 및 코드 검토 보고서

본 보고서는 **Instagram Clone (Aura+) React Native Frontend** 프로젝트 전체에 대한 아키텍처 분석 결과입니다.

---

## 1. 폴더 구조 (Folder Structure)

- **현재 상태**
  - Layer-based(계층 중심) 폴더 구조 (`components/`, `screens/`, `services/`, `context/`, `utils/`)와 Feature-based(기능 중심) 폴더 구조 (`features/direct/`)가 혼재된 구조입니다.
  - [components](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components) 디렉터리에 28개 파일, [screens](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens) 디렉터리에 17개 파일이 서브 도메인 분류 없이 평탄(Flat)하게 나열되어 있습니다.
  - 전역 커스텀 훅(`src/hooks/`) 및 전역 타입 정의(`src/types/`) 디렉터리가 부재합니다.

- **문제점**
  - 도메인(Feed, Admin, Story, Community, Auth 등)별 관련 화면과 모달, 컴포넌트가 파편화되어 파일 탐색 및 의존성 파악이 어렵습니다.
  - `direct` 기능만 `features/` 하위에 위치하여 프로젝트 전체의 구조적 일관성이 저해되어 있습니다.

- **개선 이유**
  - 도메인 단위(Feature-driven) 또는 도메인별 하위 폴더(Domain Sub-directories)로 구조화하면 모듈 간 결합도가 낮아지고 코드 응집도가 향상됩니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [frontend/src/](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src) 하위 구조 전체
  - [App.js](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/App.js)
  - [RootNavigator.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/navigation/RootNavigator.tsx)

---

## 2. 기능별 책임 분리 (Separation of Responsibilities)

- **현재 상태**
  - 화면 컴포넌트 단일 파일에 비즈니스 로직, API 호출, 상태 관리, 모달 제어, UI 레이아웃, 스타일 선언이 모두 집중된 "God Object" 형태의 거대 파일들이 다수 존재합니다.

- **문제점**
  - [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx) (1,592라인), [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx) (1,126라인), [AdminUserActivityModal.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/AdminUserActivityModal.tsx) (1,048라인) 등 단일 책임 원칙(SRP)이 심각하게 위배되어 있습니다.
  - 8개 이상의 모달 열림/닫힘 상태, 피드 페칭, 좋아요/북마크/팔로우 API 호출, UI rendering이 하나의 Screen 컴포넌트 안에서 동시 처리되고 있습니다.

- **개선 이유**
  - Custom Hook(비즈니스 로직/상태), API Service(서버 통신), Presenter Component(순수 UI)로 분리해야 유지보수가 가능하고 유닛 테스트 작성이 용이해집니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [CommunityScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/CommunityScreen.tsx)
  - [AdminUserActivityModal.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/AdminUserActivityModal.tsx)
  - [PostDetailModal.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/PostDetailModal.tsx)

---

## 3. 컴포넌트 구조 (Component Structure)

- **현재 상태**
  - 컴포넌트 재사용성이 낮고, 복잡한 인라인 JSX 및 서브 렌더링 함수(`renderPostItem`, `renderGridItem`, `renderSearchResultItem`)가 Screen 내부 closure 함수로 선언되어 있습니다.
  - 전체 프로젝트에서 `React.memo` 적용 사례가 0건입니다.

- **문제점**
  - Screen 내부에 선언된 `renderItem` 함수가 Screen 리렌더링 시마다 매번 재생성되어 FlatList 자식 아이템 전체의 렌더링 연산을 유발합니다.
  - 공통 UI 요소(Button, Input, Avatar, Card 등)가 디자인 시스템 컴포넌트로 공통화되지 않고 화면마다 인라인 스타일과 JSX로 중복 구현되어 있습니다.

- **개선 이유**
  - 컴포넌트를 서브 단위로 추출하고 `React.memo` 및 `useCallback`을 적용하여 불필요한 Virtual DOM Diffing 연산을 방지하고 렌더링 성능을 확보해야 합니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx)
  - [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx)
  - [CommentsModal.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/CommentsModal.tsx)

---

## 4. Context 사용 (Context Usage)

- **현재 상태**
  - [AuthContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/AuthContext.tsx), [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx), [ThemeContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/ThemeContext.tsx), [DirectPresenceContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/features/direct/DirectPresenceContext.tsx) 총 4개의 Context가 제공되고 있습니다.

- **문제점**
  - Context Provider의 `value` 객체에 `useMemo`가 적용되지 않아 Context 내 단일 상태 변경에도 하위 전체 컴포넌트 트리가 재렌더링됩니다. (예: `AuthContext.tsx` 207-222줄, `NotificationContext.tsx` 155-166줄)
  - `AuthContext.tsx` 내 `refreshProfile`이 매 렌더링마다 인라인 익명 화살표 함수로 새로 생성되어 인스턴스가 갱신됩니다.
  - `NotificationContext.tsx`에서 5초 주기 `setInterval` Polling과 WebSocket 실시간 수신이 동시 실행되어, Polling 시마다 전역 상태 업데이트 및 리렌더링 연쇄 반응을 일으킵니다.

- **개선 이유**
  - Context Value 메모이제이션 및 전역 상태 분리(Server State vs Client UI State)를 적용하여 앱 전반의 렌더링 폭포 현상(Re-render Cascade)을 차단해야 합니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [AuthContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/AuthContext.tsx)
  - [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx)
  - [ThemeContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/ThemeContext.tsx)

---

## 5. API 계층 (API Layer)

- **현재 상태**
  - Axios 인스턴스는 [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)에 구축되어 있으나, 도메인 서비스 추상화 없이 화면 및 모달 컴포넌트 내에서 150곳 이상의 엔드포인트 경로(`/posts/feed`, `/users/me`, `/stories/feed` 등)를 `api.get()`, `api.post()`로 직접 호출하고 있습니다.

- **문제점**
  - HTTP 요청 엔드포인트, 쿼리 파라미터, 응답 데이터 파싱 로직이 UI 코드 전체에 강하게 결합되고 중복되어 있습니다.
  - 캐싱, 중복 요청 방지(Deduplication), 자동 재시도, 비동기 상태(`isLoading`, `isError`, `refetch`) 관리 라이브러리(TanStack Query / SWR)가 부재합니다.
  - [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)의 401 response interceptor에서 동시 다발적 토큰 만료 요청 발생 시 중복 Refresh Request 방지 Queue 메커니즘이 부족합니다.

- **개선 이유**
  - 도메인별 API Service 캡슐화 및 서버 상태 관리 라이브러리(TanStack Query) 도입을 통해 네트워크 효율성 및 비동기 상태 관리 표준화를 달성해야 합니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [api.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/services/api.ts)
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx)
  - [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx)
  - [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)

---

## 6. Hook 구조 (Hook Structure)

- **현재 상태**
  - 공용 커스텀 훅 디렉토리(`src/hooks/`)가 전혀 존재하지 않으며, [useDirectConversation.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/features/direct/useDirectConversation.ts) 단 1개만 특정 기능 하위에 존재합니다.

- **문제점**
  - 피드 조회, 무한 스크롤, 스토리 목록 관리, 검색 Debounce, 팔로우 처리, 폼 상태 관리 등 재사용 가능한 핵심 로직이 각 Screen 파일 내부에 15~30개의 inline `useState` / `useEffect`로 중복 구현되어 있습니다.
  - 비즈니스 로직 독립 테스트가 불가능한 구조입니다.

- **개선 이유**
  - `useFeed`, `useStories`, `useProfile`, `useDebounce`, `usePagination` 등 도메인/유틸리티 커스텀 훅으로 로직을 분리하여 코드 재사용성과 가독성을 향상시켜야 합니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - `src/hooks/` (신규 설계 대상)
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx)
  - [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx)

---

## 7. Utils 구성 (Utils Structure)

- **현재 상태**
  - `src/utils/` 디렉토리에 [displayName.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/utils/displayName.ts) (14줄) 1개만 작성되어 있습니다.

- **문제점**
  - 날짜/상대 시간 포맷팅, 이미지 URL 검증/보정, 텍스트 줄바꿈 처리, AsyncStorage 키 관리, 에러 메시지 파싱 유틸리티가 여러 화면에 산발적으로 직접 작성되어 코드 중복이 발생합니다.
  - (예: `features/direct/formatters.ts`와 다른 모듈 간 날짜 관련 로직 중복)

- **개선 이유**
  - 순수 함수(Pure Functions) 형태의 유틸리티 모듈(Date, Storage, Validation, Image, String)을 단일화(Single Source of Truth)하여 정밀한 단원 테스트 및 신뢰성을 확보해야 합니다.

- **우선순위**: **중간 (Medium)**

- **수정 대상 파일**
  - [displayName.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/utils/displayName.ts)
  - `src/utils/` (신규 유틸 모듈군 설계)

---

## 8. 타입 정의 (Type Definitions)

- **현재 상태**
  - 전역 타입 디렉터리(`src/types/`)가 없으며, 프로젝트 전체에서 160건 이상의 `: any` 및 `any[]` 타입 지정이 발견됩니다.

- **문제점**
  - React Navigation의 Route/Navigation Props, API 응답 객체, 게시글/유저/스토리/댓글 모델 타입이 `: any`로 표기되어 TypeScript의 정적 검사 및 자동 완성(IntelliSense) 기능이 무력화되어 있습니다.
  - 런타임 `undefined` 참조 에러 및 타입 갱신 시 컴파일 오류 감지가 불가능합니다.

- **개선 이유**
  - Strict TypeScript 타입을 도입하고 전역 Entity/DTO/Navigation 타입 시스템 구축으로 안정적인 개발 환경을 조성해야 합니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - `src/types/` (신규 설계 대상)
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)
  - [UserProfileScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/UserProfileScreen.tsx)
  - [SearchScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/SearchScreen.tsx)

---

## 9. 성능 문제 (Performance Issues)

- **현재 상태**
  - FlatList 최적화 속성(`windowSize`, `maxToRenderPerBatch`, `removeClippedSubviews`, `getItemLayout`) 미지정.
  - 기본 React Native `Image` 컴포넌트를 사용하여 이미지 캐싱 및 디스크 메모리 관리 비효율 발생.
  - 5초 주기 통지 Polling 및 메모이제이션 미적용 Context로 인한 정기적 전역 리렌더링.

- **문제점**
  - 피드 스크롤 시 프레임 드랍(FPS Drop), 스크롤 렉 및 모바일 기기 발열/배터리 소모가 심화됩니다.
  - 텍스트 입력이나 무관한 상태 변경 시 목록 전체 아이템이 재렌더링됩니다.

- **개선 이유**
  - 60FPS의 매끄러운 스크롤 성능 확보 및 메모리/네트워크 자원 효율성을 위해 스크롤 목록 및 이미지 캐싱 최적화가 필수적입니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [NotificationContext.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/context/NotificationContext.tsx)
  - [PostCarousel.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/PostCarousel.tsx)
  - [StoryBar.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/StoryBar.tsx)

---

## 10. 유지보수성 (Maintainability)

- **현재 상태**
  - [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx) (1,592줄), [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx) (1,126줄), [AdminUserActivityModal.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/AdminUserActivityModal.tsx) (1,048줄) 등 1,000줄이 넘는 초거대 파일이 다수 존재합니다.
  - 하드코딩된 API 경로, Storage Key 문자열, 중복 스타일 시트가 프로젝트 전반에 축적되어 있습니다.

- **문제점**
  - 기능 수정 및 버그 수정 시 Side Effect 발생 가능성이 매우 높으며 신규 개발자의 프로젝트 파악 난이도가 극도로 높습니다.
  - 전역 디자인 토큰(Color, Spacing, Typography) 관리가 미흡하여 화면마다 수백 줄의 `StyleSheet.create`가 중복됩니다.

- **개선 이유**
  - 모듈화 및 디자인 시스템/상수 관리를 체계화하여 프로젝트 확장성(Scalability) 및 개발 생산성을 극대화해야 합니다.

- **우선순위**: **높음 (High)**

- **수정 대상 파일**
  - [AdminScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/AdminScreen.tsx)
  - [FeedScreen.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/screens/FeedScreen.tsx)
  - [AdminUserActivityModal.tsx](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/components/AdminUserActivityModal.tsx)
  - [colors.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/theme/colors.ts)
  - [config.ts](file:///c:/Users/zgpap.BOTTOM/.antigravity-ide/instagram-clone/frontend/src/config.ts)

---

### 💡 요약 및 총평
현재 프로젝트는 기능 구현이 완료되어 동작하고 있으나, **거대 Screen 파일 집중**, **API/비즈니스 로직 추상화 부재**, **Context/List 메모이제이션 부재**, **any 타입 사용**으로 인해 유지보수성 및 성능 관점에서 개선이 필요합니다.
