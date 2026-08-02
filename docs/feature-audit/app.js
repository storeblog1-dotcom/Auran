const features = [
  {
    id: "notifications", number: "01", title: "알림", score: 88, status: "verify", label: "구현 완료 · 검증 대기",
    summary: "DM·좋아요·댓글·팔로우·멘션 푸시와 앱 안 읽음 상태를 하나의 흐름으로 연결했습니다.",
    priority: "실기기 권한과 종료 상태 푸시를 먼저 확인해야 합니다.",
    capabilities: [
      { title: "푸시 등록과 전달", status: "implemented", description: "로그인 설치 단위 토큰 등록, 토큰 갱신, 로그아웃 비활성화와 Expo receipt 동기화를 사용합니다.", behavior: "DM 전용이던 서버 전달을 좋아요·댓글·팔로우·멘션·신고 결과·운영 경고까지 확장했습니다.", evidence: "frontend/src/services/pushNotifications.ts · backend/app/modules/notifications/push.py" },
      { title: "알림 클릭 이동", status: "verify", description: "앱 종료·백그라운드·포그라운드에서 받은 알림 데이터를 공통 네비게이션 경로로 전달합니다.", behavior: "DM은 대화방, 댓글은 댓글이 열린 게시물, 좋아요·멘션은 게시물, 팔로우는 프로필로 이동합니다.", evidence: "frontend/src/navigation/RootNavigator.tsx · PushNotificationManager.tsx" },
      { title: "안 읽은 메시지 배지", status: "verify", description: "대화 참여자의 마지막 읽음 시각을 저장하고 방별·전체 안 읽은 수를 계산합니다.", behavior: "대화 목록의 숫자 배지와 하단 DM 탭 배지가 같은 서버 상태를 사용합니다.", evidence: "20260802_0100 migration · direct/router.py · NotificationContext.tsx" },
    ],
  },
  {
    id: "admin", number: "02", title: "관리자", score: 90, status: "verify", label: "안전성 보강 · 검증 대기",
    summary: "신고·숨김·삭제·경고·정지를 유지하면서 잘못된 조치 조합과 차단 예외를 방어했습니다.",
    priority: "운영 권한 기능이므로 잘못된 대상 조치가 없는지 통합 검증이 필요합니다.",
    capabilities: [
      { title: "신고 접수와 증거", status: "implemented", description: "게시물·댓글·프로필 신고, 일일 제한, 중복 방지, 콘텐츠 snapshot과 법적 보존을 지원합니다.", behavior: "관리자 상세 열람과 조치는 감사 로그에 남고 신고자에게 결과 알림을 전송합니다.", evidence: "backend/app/modules/reports · frontend/src/components/ReportSheet.tsx" },
      { title: "제재 조합 검증", status: "implemented", description: "프로필 신고에는 의미 없는 숨김·삭제를 허용하지 않습니다.", behavior: "경고·정지는 사유 입력이 필수이고 프론트 버튼도 대상 유형에 맞게 제한됩니다.", evidence: "reports/schemas.py · reports/router.py · AdminReportDetailModal.tsx" },
      { title: "사용자 차단", status: "implemented", description: "자기 차단을 거부하고 중복 차단을 멱등 처리합니다.", behavior: "차단 목록 조회와 차단 해제 API를 추가했으며 차단 시 양방향 팔로우를 제거합니다.", evidence: "backend/app/modules/users/router.py" },
    ],
  },
  {
    id: "search", number: "03", title: "검색", score: 92, status: "verify", label: "구현 완료 · 검증 대기",
    summary: "사람·게시물·해시태그 세 축의 검색과 탐색 피드를 분리했습니다.",
    priority: "검색어 경쟁 상태와 비공개 콘텐츠 노출 여부를 API 통합 환경에서 확인해야 합니다.",
    capabilities: [
      { title: "사람 검색", status: "implemented", description: "아이디·이름 검색과 결과 내 팔로우 전환을 제공합니다.", behavior: "관리자 프로필 표시와 기존 프로필 이동 정책을 유지합니다.", evidence: "frontend/src/screens/SearchScreen.tsx · users/service.py" },
      { title: "게시물 검색", status: "implemented", description: "제목·본문·작성자 이름을 검색해 게시물 그리드로 표시합니다.", behavior: "공개 범위, 비공개 계정, 팔로워 공개, 사용자 숨김과 운영 숨김 조건을 그대로 적용합니다.", evidence: "posts/router.py /posts/search · posts/service.py search_posts" },
      { title: "해시태그와 응답 순서", status: "implemented", description: "해시태그 검색과 태그별 게시물 화면을 유지합니다.", behavior: "300ms debounce에 요청 일련번호를 더해 이전 응답이 최신 결과를 덮지 못하게 합니다.", evidence: "frontend/src/screens/SearchScreen.tsx" },
    ],
  },
  {
    id: "upload", number: "04", title: "업로드 UX", score: 84, status: "verify", label: "구현 완료 · 실기기 검증",
    summary: "다중 이미지에 자르기·진행률·자동 임시 저장을 추가했습니다.",
    priority: "기기별 이미지 URI 지속성과 대용량 업로드 진행률을 확인해야 합니다.",
    capabilities: [
      {
        title: "게시 전 이미지·텍스트 안전 검사",
        status: "verify",
        description: "활성화된 OpenAI Moderation으로 피드 이미지와 캡션·댓글을 공개 저장 전에 검사합니다. 이 단계의 차단 대상은 콘텐츠이며 이용자 계정이 아닙니다.",
        behavior: "안전한 콘텐츠만 게시하고 명백한 성적 콘텐츠는 등록을 거부합니다. 경계 결과와 공급자 오류는 공개하지 않고 검토 대상으로 남기며 작성자에게 등록되지 않은 이유와 이의신청 가능성을 알립니다. 계정 경고·정지는 관리자 신고 심사에서만 별도로 결정합니다.",
        completion: "운영 키 등록, 한국어·이미지 정상/유해 샘플 실기기 검증, 오탐 이의신청 화면 검증이 필요합니다.",
        evidence: "backend/app/modules/uploads/router.py · posts/service.py · governance/service.py · CONTENT_MODERATION_RESULT 알림",
      },
      {
        title: "탐색·피드·상세용 3단 압축",
        status: "implemented",
        description: "업로드 파일 하나를 서버에서 탐색 썸네일, 피드 표시용, 상세 확대용 JPEG 세 벌로 생성합니다. 단순 입력 용량 제한과 별개의 이미지 변환 단계입니다.",
        behavior: "탐색은 thumbnail_media_url의 480px 썸네일, 홈 피드는 media_url의 1080px 압축본, 확대 화면은 detail_media_url의 2048px 압축본을 사용하며 각 단계에 이전 URL fallback이 있습니다.",
        evidence: "uploads/router.py process_and_resize_image · PostMedia.thumbnail_media_url · SearchScreen.tsx · PostCarousel.tsx · ImageDetailViewerModal.tsx",
        technical: [
          ["입력 전처리", "EXIF 방향을 실제 픽셀에 반영하고 RGB로 변환한 뒤 동일한 보정 원본에서 세 파생본을 각각 만듭니다."],
          ["탐색용 thumbnail", "긴 변 최대 480px, LANCZOS 리사이즈, 목표 100KB 이하, {UUID}_thumbnail.jpg로 저장합니다."],
          ["피드용 display", "게시물은 긴 변 최대 1080px, LANCZOS 리사이즈, 목표 300KB 이하, {UUID}_display.jpg로 저장합니다."],
          ["상세용 detail", "긴 변 최대 2048px, LANCZOS 리사이즈, 목표 1MB 이하, {UUID}_detail.jpg로 별도 저장합니다."],
          ["가변 품질 압축", "JPEG 품질 85부터 5씩 낮춰 품질 5까지 시도합니다. 그래도 목표 크기를 넘으면 가로·세로를 85%로 줄이고 다시 품질 85부터 반복합니다."],
          ["데이터 연결", "서버 응답의 thumbnail_url·url·detail_url을 thumbnail_media_url·media_url·detail_media_url로 저장해 화면별로 구분합니다."],
          ["기존 게시물", "thumbnail_media_url이 없는 동안 탐색은 media_url을 사용하며, backfill_post_thumbnails.py가 기존 이미지에서 썸네일을 안전하게 추가할 수 있습니다."],
          ["현재 주의점", "상세용은 무압축 원본이 아닙니다. 갤러리 선택 quality 0.8, 카메라 0.85, 자르기 JPEG 0.9 이후 서버가 다시 압축하므로 기기 원본보다 정보가 줄어들 수 있습니다."],
        ],
      },
      { title: "이미지 여러 장", status: "implemented", description: "갤러리에서 최대 10장을 선택하고 순서·삭제·미리보기를 관리합니다.", behavior: "서버에는 순서가 포함된 media 배열로 저장합니다.", evidence: "frontend/src/screens/CreatePostScreen.tsx" },
      { title: "비율 자르기", status: "verify", description: "각 로컬 이미지에서 원본·1:1·4:5 중앙 자르기를 순환 선택합니다.", behavior: "항상 원본 URI와 크기를 기준으로 다시 계산해 누적 손실을 방지합니다.", evidence: "expo-image-manipulator · handleCycleCrop" },
      { title: "진행률과 임시 저장", status: "verify", description: "파일별 전송량을 전체 업로드 비율로 합산하고 게시물 생성 단계를 별도로 반영합니다.", behavior: "작성 값은 0.5초 후 기기 저장소에 보존되고 성공 게시 후 제거됩니다.", evidence: "Axios onUploadProgress · AsyncStorage" },
    ],
  },
  {
    id: "profile", number: "05", title: "프로필", score: 94, status: "implemented", label: "기존 구현 확인",
    summary: "프로필 표시·수정·팔로우 관계·게시물 탭이 이미 연결되어 있으며 회귀 검증만 남았습니다.",
    priority: "신규 구현보다 비공개 계정과 팔로우 요청의 2계정 시나리오 검증이 우선입니다.",
    capabilities: [
      { title: "프로필 디자인과 편집", status: "implemented", description: "프로필 이미지, 이름, 닉네임, 소개, 비밀번호와 공개 설정을 변경합니다.", behavior: "관리자 프로필 정책과 이미지 업로드 목적 구분도 유지합니다.", evidence: "ProfileScreen.tsx · EditProfileScreen.tsx" },
      { title: "팔로워·팔로잉", status: "implemented", description: "목록, 수치, 팔로우·언팔로우, 비공개 계정 요청 수락·거절을 지원합니다.", behavior: "낙관적 UI 실패 시 서버 상태로 되돌립니다.", evidence: "UserProfileScreen.tsx · FollowRequestsModal.tsx · users/router.py" },
      { title: "게시물 탭", status: "implemented", description: "내 프로필은 게시물·저장·리포스트, 다른 사용자 프로필은 게시물·리포스트를 제공합니다.", behavior: "각 탭은 기존 게시물 상세 모달과 동일한 데이터 구조를 사용합니다.", evidence: "ProfileScreen.tsx · UserProfileScreen.tsx" },
    ],
  },
  {
    id: "feed-distribution", number: "06", title: "피드 배포·성능", score: 96, status: "verify", label: "운영 배포 완료 · 실기기 검증",
    summary: "홈 피드와 탐색 그리드에 참여도·신선도 랭킹, 세션 랜덤 순서, 무한 스크롤과 이미지 선행 로딩을 연결했습니다.",
    priority: "운영 API 반영은 확인했으며 다양한 기기에서 스크롤 지속성과 이미지 체감 속도를 최종 확인해야 합니다.",
    capabilities: [
      {
        title: "참여도·24시간 신선도 랭킹",
        status: "implemented",
        description: "등록 순서 대신 좋아요·댓글·신규 게시물 보너스를 합산한 점수로 우선순위를 결정합니다.",
        behavior: "점수는 좋아요 수 + 댓글 수×2 + 등록 후 24시간 이내 보너스 10입니다. 점수가 높을수록 먼저 노출되고 같은 점수 안에서는 seed 기반 순서가 적용됩니다.",
        evidence: "backend/app/modules/posts/service.py · calculate_feed_rank_score · _ranked_posts_query",
        technical: [
          ["기본 참여도", "좋아요 1개는 1점, 숨김 처리되지 않은 댓글 1개는 2점으로 계산합니다."],
          ["신규 게시물", "created_at이 서버 현재 시각 기준 24시간 이내면 10점을 더해 새 게시물도 상단 경쟁에 참여하게 합니다."],
          ["동점 처리", "게시물 ID와 ranking_seed를 결합한 MD5 값을 정렬 키로 사용해 동점 게시물만 안정적으로 섞습니다."],
          ["공개 범위", "차단·비공개·팔로워 공개·운영 숨김 등 기존 visibility 조건을 그대로 통과한 게시물만 랭킹 대상이 됩니다."],
        ],
      },
      {
        title: "세션 고정 랜덤 페이지네이션",
        status: "implemented",
        description: "페이지를 넘길 때 순서가 다시 섞여 중복되는 문제를 막기 위해 한 세션 동안 같은 ranking_seed를 사용합니다.",
        behavior: "홈은 20개, 탐색은 이미지가 있는 일반 피드 30개씩 요청합니다. 새로고침할 때만 seed를 바꿔 새로운 순서를 만들고, 추가 페이지는 기존 seed를 유지합니다.",
        evidence: "posts/router.py /feed·/explore ranking_seed · feedService.ts · FeedScreen.tsx · SearchScreen.tsx",
        technical: [
          ["서버 has_more", "요청 크기보다 1개 더 조회한 뒤 초과 항목이 있으면 has_more=true를 반환하고 실제 응답에서는 초과 항목을 제거합니다."],
          ["홈 피드", "page=1, size=20에서 시작하며 onEndReached가 다음 페이지를 요청합니다."],
          ["탐색 그리드", "page=1, size=30에서 시작하고 media가 존재하는 일반 피드만 3열 그리드에 누적합니다."],
          ["중복 보호", "클라이언트는 이미 표시된 게시물 ID 집합을 만들어 다음 페이지와 겹치는 항목을 추가하지 않습니다."],
        ],
      },
      {
        title: "이미지 프리패치와 목록 성능 보호",
        status: "verify",
        description: "새 라이브러리 없이 React Native Image.prefetch로 곧 표시될 이미지를 캐시에 미리 요청합니다.",
        behavior: "홈은 최초 10개·다음 페이지 12개, 탐색은 최초 24개·다음 페이지 30개를 백그라운드에서 선행 로딩합니다. FlatList는 화면 근처 항목만 유지하도록 렌더 배치와 windowSize를 제한합니다.",
        evidence: "frontend/src/utils/imagePrefetch.ts · FeedScreen.tsx · SearchScreen.tsx · React Native 0.85.3 Image.prefetch",
        technical: [
          ["대상 URL", "각 게시물의 첫 번째 피드용 media_url만 getFullImageUrl로 정규화해 요청합니다."],
          ["화면별 URL", "홈은 media_url, 탐색은 thumbnail_media_url을 선행 요청하고 썸네일이 없는 기존 게시물만 media_url로 대체합니다."],
          ["캐시 요청", "데이터를 먼저 화면에 반영한 뒤 최대 4개씩 Image.prefetch를 실행하고, 이미지 한 장 실패가 피드 표시나 다른 요청을 막지 않게 합니다."],
          ["메모리 보호", "최근 프리패치 URL 기록을 최대 120개로 제한하고 이미 요청한 URL은 다시 요청하지 않습니다."],
          ["가상화", "Android removeClippedSubviews와 화면별 initialNumToRender, maxToRenderPerBatch, windowSize를 적용해 페이지가 누적돼도 실제 렌더 범위를 제한합니다."],
        ],
      },
      {
        title: "자동 검사·운영 배포·APK",
        status: "verify",
        description: "변경 코드는 자동 검사 후 Cloud Run 운영 서비스와 Android Release APK에 반영했습니다.",
        behavior: "백엔드 revision 00078이 트래픽 100%를 받고 health 200과 운영 OpenAPI의 ranking_seed를 확인했습니다. APK는 생성·서명·해시 일치까지 확인했으며 실기기 체감 검증이 남았습니다.",
        evidence: "백엔드 테스트 54개 통과 · TypeScript 오류 0 · Cloud Run instagram-backend-00078-8rm · app-release.apk SHA256 B0E473DD6EFCFD949F9D484312E0FFC648F54E676536066BB1C7F028D9DFF818",
      },
    ],
  },
  {
    id: "policy-safety", number: "07", title: "운영정책·개인정보·안전", score: 82, status: "verify", label: "코드 구현 · migration/운영 검증 대기",
    summary: "정책 버전 동의, 최소 식별자, 위험 기반 가입 판정, 다중 신고, 콘텐츠 조치와 계정 제재 분리, 이의신청·파기 기반을 구현했습니다. 법률 검토와 운영 migration 검증 전에는 최종 완료로 보지 않습니다.",
    priority: "정책 문서만 바꾸지 말고 데이터 모델·API 권한·자동 파기·관리자 처리와 사용자 화면을 같은 기준으로 구현해야 합니다.",
    capabilities: [
      {
        title: "감사 페이지 접근 보호", status: "verify",
        description: "/feature-audit의 HTML·CSS·JavaScript·테스트 계정 자료 전체를 서버 인증 뒤에 두고 공용 감사 비밀번호를 앱 Superadmin 비밀번호와 분리합니다.",
        behavior: "초기 비밀번호는 배포 Secret으로만 전달하고 DB에는 bcrypt 해시만 저장합니다. 최초 로그인 직후 12자 이상 새 비밀번호 설정을 강제하며 Secure·HttpOnly·SameSite 세션, CSRF 검증, 5회 실패 15분 잠금, 비밀번호 변경 시 전체 세션 무효화를 적용합니다.",
        completion: "운영 URL 최초 비밀번호 변경, 비인증 자산 직접 접근 차단, 잠금·초기화·세션 만료를 실제 브라우저에서 검증해야 합니다.",
        evidence: "backend/app/modules/feature_audit · 20260802_feature_audit_auth migration · AdminIntegrationSection.tsx",
      },
      {
        title: "회원가입 동의와 연령 정책", status: "verify",
        description: "이용약관, 개인정보 수집·이용, 보안 로그, 커뮤니티 정책, 만 14세 이상 확인을 구분하고 정책 버전별 동의 증거를 보존합니다.",
        behavior: "필수·선택·민감정보 동의를 분리하고 약관 버전, 문서 해시, 동의 시각, 가입 IP, 설치 식별자 HMAC, 앱 버전을 기록합니다. 성적 지향 정보는 선택 입력·별도 동의·기본 비공개로 취급합니다.",
        completion: "데이터 모델·가입 UI·정책 버전 API·철회 화면과 만 14세 미만 가입 차단 테스트가 모두 필요합니다.",
        evidence: "governance/models.py · auth/schemas.py · auth/router.py · RegisterScreen.tsx · 20260802_governance_safety migration",
        technical: [
          ["필수 동의", "이용약관, 개인정보 처리, 보안·부정이용 방지용 IP/설치 식별자, 커뮤니티 운영정책, 신고·제재·이의신청 정책을 구분합니다."],
          ["선택 동의", "마케팅, 선택 프로필 공개, 별도 개인정보를 쓰는 개인화는 거부해도 핵심 서비스 가입을 막지 않습니다."],
          ["민감정보", "성적 지향은 입력할 때 별도 동의를 받고 기본 비공개, 항목 삭제 가능, 광고·피드 순위·제재 판단 사용 금지를 적용합니다."],
          ["정책 변경", "중대한 변경은 새 버전을 발행하고 필요한 경우 재동의를 받습니다. 외부 API 활성화 전에 처리방침 반영 여부를 확인합니다."],
        ],
      },
      {
        title: "설치 식별자·IP 감사와 부정가입 방지", status: "verify",
        description: "IMEI·Serial·MAC·광고 ID는 수집하지 않고 앱 설치 단위 무작위 GUID와 중요 행위의 IP를 보안 목적으로 처리합니다.",
        behavior: "동일 IP를 동일인으로 단정해 가입을 막지 않습니다. IP·설치 ID·이메일 인증·요청 속도·제재 연관성을 위험 점수로 결합해 허용, 추가 확인, 임시 보류, 관리자 검토로 나눕니다.",
        completion: "설치 ID 보안 저장, 서버 HMAC, 감사 이벤트, rate limit, 오탐 이의신청과 관리자 조회 권한 분리가 구현되어야 합니다.",
        evidence: "governance/service.py installation_fingerprint/apply_signup_risk_checks · audit/service.py · User.installation_id_hmac",
        technical: [
          ["수집 대상", "회원가입·로그인·비밀번호 복구·중요 프로필 변경·게시·댓글·DM·신고·탈퇴·관리자 조치와 비정상 대량 요청을 기록합니다."],
          ["기록 항목", "사용자/시도 ID, IP, 설치 ID HMAC, 발생 시각, 행위·대상, 앱·OS 버전, request ID와 성공·실패 코드를 남깁니다."],
          ["기본 제한안", "IP는 24시간 신규 가입 3개, 설치 ID는 30일 2개를 기준으로 추가 인증 또는 검토하며 공유망·VPN이라는 이유만으로 자동 영구차단하지 않습니다."],
          ["접근 통제", "원문 IP는 일반 관리자 화면에서 숨기고 보안·법무 권한의 열람과 그 열람 자체를 감사기록으로 남깁니다."],
        ],
      },
      {
        title: "다중 신고와 긴급 격리", status: "verify",
        description: "현재 단일 reason_code 신고를 복수 선택으로 확장하고 피드·익명글·댓글·대댓글·프로필·DM을 같은 신고 사건 구조로 처리합니다.",
        behavior: "신고자에게는 접수 확인만 제공하고 최종 제재 결과는 알리지 않습니다. 불법 촬영물 의심, 비동의 성적 이미지, 아동 성착취 의심, 구체적 위협과 중대한 개인정보 노출은 긴급 대기열과 비공개 격리로 보냅니다.",
        completion: "DB migration, 다중 선택 폼, 관리자 긴급 대기열, 신고자 결과 알림 제거와 신고 아이콘 범위 검증이 필요합니다.",
        evidence: "reports.reason_codes migration · ReportSheet.tsx 복수 선택 · reports/router.py 관리자 통지 · AdminReportDetailModal.tsx 기본 블러",
        technical: [
          ["신고 사유", "혐오·차별, 성희롱, 괴롭힘·협박, 아웃팅, 개인정보 노출, 비동의 성적 이미지, 아동 성착취 의심, 음란물, 사칭, 스팸·사기, 자해·긴급 위험, 기타를 복수 선택합니다."],
          ["즉시 보호", "신고자의 화면에서는 대상을 즉시 숨길 수 있지만 신고 수만으로 전체 사용자에게 자동 삭제하지 않습니다."],
          ["관리자 보호", "원본 이미지는 기본 블러 상태로 표시하고 권한 있는 관리자의 명시적 열람과 처리 이력을 남깁니다."],
          ["범위 제외", "외부 불법 이미지 해시 매칭 시스템과 외부 전문 관제 서비스는 범위에서 제외하고 내부 관리자 검토를 사용합니다."],
        ],
      },
      {
        title: "콘텐츠 조치·계정 제재·이의신청", status: "verify",
        description: "현재 하나의 moderation action을 콘텐츠 처리와 계정 제재로 분리하고 기간 정지와 영구정지의 서버 집행을 구현합니다.",
        behavior: "콘텐츠는 유지·접근제한·숨김·삭제, 계정은 없음·경고·5일·10일·30일·영구정지를 독립 선택합니다. 기간 정지는 자동 해제하고 영구정지는 즉시 비공개·접근 차단 후 90일 이의신청과 관리자 최종 확인을 거칩니다.",
        completion: "제재 모델·멱등 API·토큰/세션/WebSocket 차단·자동 해제·90일 처리·작성자 통지·이의신청 테스트가 필요합니다.",
        evidence: "AccountSanction/ModerationAppeal 모델 · reports/router.py 분리 처분 · governance maintenance/appeal API · auth/dependencies.py 서버 차단",
        technical: [
          ["기간 정지", "suspended_until을 UTC로 저장하고 쓰기·DM·WebSocket을 즉시 차단하며 만료 시 자동 해제합니다."],
          ["영구정지", "프로필·피드·댓글·대댓글을 일반 사용자에게 비공개하고 90일 동안 해명·이의신청을 받습니다."],
          ["최종 처리", "이의신청 중 파기를 멈추고 기한 도달 전·도달 시 관리자 알림 후 사람의 최종 확인으로 강제 탈퇴를 실행합니다."],
          ["통지 분리", "내부 관리자 메모와 작성자 안내문을 분리하고 신고자의 신원은 작성자에게 공개하지 않습니다."],
        ],
      },
      {
        title: "정보 유형별 보존과 자동 파기", status: "verify",
        description: "일반 계정정보 일괄 365일 보존을 폐기하고 목적별 보존기간, 법적 보존 분리와 복구 불가능한 파기를 구현합니다.",
        behavior: "7일 탈퇴 취소 기간은 유지하되 최종 탈퇴 후 일반 프로필·인증정보는 즉시 삭제 또는 가명처리합니다. 신고·제재 증거만 최대 1년 등 고지된 기간 동안 분리 보존합니다.",
        completion: "기존 withdrawal 365일 로직과 migration을 안전하게 전환하고 저장소 파일·푸시 토큰·감사자료·백업 파기 검증이 필요합니다.",
        evidence: "audit/withdrawal.py 일반정보 즉시 파기 · audit/service.py 180/365일 목적별 보존 · legal_hold 보호 · governance maintenance",
        technical: [
          ["권장 보존표", "실패 가입·로그인 보안기록 90일, 정상 주요 활동 IP 6개월, 신고·제재 증거 1년을 기본안으로 하되 최종 법률 검토와 처리방침에 맞춥니다."],
          ["탈퇴", "7일 취소 기간 종료 후 일반 식별정보를 즉시 가명처리하고 푸시 토큰과 활성 세션을 무효화합니다."],
          ["법적 보존", "적법한 분쟁·수사 대상만 일반 데이터와 분리하고 목적 종료 후 복구 불가능하게 파기합니다."],
          ["스케줄", "기간 정지 해제, 90일 강제 탈퇴 점검, 개인정보 파기와 증거 만료 정리를 멱등 작업으로 만들고 Scheduler 상태를 감시합니다."],
        ],
      },
    ],
  },
  {
    id: "external-integrations", number: "08", title: "외부 서비스·비밀키 관리", score: 72, status: "external", label: "코드 구현 · 마스터키/자격증명 대기",
    summary: "API 키만으로 켤 수 있는 서비스는 Superadmin 전용 메뉴에서 등록·테스트·활성화하고 네이티브·계약형 서비스는 외부 설정 상태를 별도로 관리합니다.",
    priority: "비밀키를 DB 평문·APK·로그에 노출하지 않는 저장 구조와 Superadmin 권한을 먼저 마련한 뒤 공급자별 어댑터를 연결해야 합니다.",
    capabilities: [
      {
        title: "Superadmin 외부 연동 메뉴", status: "verify",
        description: "현재 is_admin 단일 권한을 moderator·admin·superadmin으로 분리하고 외부 연동 설정은 Superadmin만 변경합니다.",
        behavior: "OpenAI, Resend, Turnstile, Google Vision 카드를 제공하며 자격증명 등록, 연결 테스트, 활성화, 비활성화, 회전과 폐기를 지원합니다. 전체 키는 다시 보여주지 않습니다.",
        completion: "권한 migration, 재인증, 연동 관리 API·화면, 접근 거부와 감사 테스트가 필요합니다.",
        evidence: "User.admin_role · governance integration API · AdminIntegrationSection.tsx · AdminScreen integrations tab",
        technical: [
          ["권한", "moderator는 신고 처리, admin은 회원·콘텐츠·제재, superadmin만 비밀키·관리자 권한·보안 설정을 관리합니다."],
          ["화면 표시", "코드 준비, 키 등록 여부, 마스킹된 마지막 4자, 연결 상태, 마지막 성공 시각, 최근 오류와 운영 상태만 표시합니다."],
          ["변경 보호", "키 등록·교체·삭제 전 관리자 재인증을 요구하고 작업자·시각·공급자·행위만 감사기록에 남깁니다."],
          ["비상 차단", "키 유출 시 공급자 비활성화, 저장 비밀 폐기, 캐시 제거, 호출 차단과 보안사고 기록을 한 흐름으로 실행합니다."],
        ],
      },
      {
        title: "관리자 비밀키 등록 사용법", status: "verify",
        description: "운영자가 키를 안전하게 등록하고 실제 서비스로 전환하는 절차를 관리자 화면에 단계별 안내로 제공합니다.",
        behavior: "정책 반영 확인 → 새 키 입력 → 암호화 저장 → 고정 자료로 연결 검사 → 관찰 모드 → 호출량·오탐 확인 → 운영 활성화 순서이며 실패한 키는 활성화할 수 없습니다.",
        completion: "가이드 UI, 입력값 메모리 제거, 테스트·활성화 상태 머신, 오류 복구와 회전 시나리오가 구현되어야 합니다.",
        evidence: "AdminIntegrationSection.tsx · docs/security-integration-operations.md · 재인증/연결검사/활성화 단계",
        technical: [
          ["1. 준비", "공급자 사이트에서 서버용 키를 발급하고 개인정보 처리방침에 처리업체·목적·전송 항목이 반영됐는지 확인합니다."],
          ["2. 등록", "관리자 대시보드 > 외부 연동에서 공급자를 선택하고 새 키를 한 번 입력합니다. 저장 완료 즉시 입력값을 지웁니다."],
          ["3. 테스트", "실제 사용자 데이터가 아닌 고정 테스트 자료로 인증과 응답 형식을 검사합니다. 성공 전에는 활성화 버튼을 잠급니다."],
          ["4. 관찰", "OpenAI Moderation은 자동 제재 없이 결과만 기록하는 Shadow Mode로 시작해 한국어와 정상 콘텐츠 오탐을 확인합니다."],
          ["5. 활성화", "Superadmin이 최종 활성화하면 런타임 캐시를 갱신해 서버 재배포 없이 호출을 시작합니다."],
          ["6. 회전·폐기", "새 키 테스트 후 원자적으로 전환하고 기존 키를 폐기합니다. 장애 시 이전 정상 키 또는 안전한 비활성 상태로 되돌립니다."],
        ],
      },
      {
        title: "비밀 저장과 초기 부트스트랩", status: "external",
        description: "서비스 키는 인증 암호화해 저장하고 암호화 마스터 키만 Cloud Run Secret Manager에서 최초 1회 외부 등록합니다.",
        behavior: "DB에는 암호문, 키 버전, fingerprint와 마지막 네 글자만 저장합니다. 마스터 키가 없으면 연동 메뉴는 조회 전용이며 비밀 등록을 거부합니다.",
        completion: "INTEGRATION_MASTER_KEY를 Secret Manager에 등록하고 암호화·복호화·회전·로그 비노출 테스트를 통과해야 합니다.",
        evidence: "IntegrationCredential AES-GCM 저장 구현 · INTEGRATION_MASTER_KEY Secret Manager 외부 등록 필요",
        technical: [
          ["절대 금지", "비밀키를 Git, APK, 프론트 환경변수, AsyncStorage, API 응답, 오류 메시지와 감사 snapshot에 저장하지 않습니다."],
          ["저장", "AES-GCM 등 인증 암호화를 사용하고 데이터 키 버전을 함께 보존해 마스터 키 회전을 지원합니다."],
          ["캐시", "복호화된 값은 서버 메모리에 최소 시간만 유지하고 비활성화·회전 시 즉시 제거합니다."],
          ["잠금", "운영 환경에서 외부 관리로 잠근 자격증명은 관리자 화면에서 덮어쓰지 못하게 source와 locked 상태를 표시합니다."],
        ],
      },
      {
        title: "OpenAI Moderation", status: "external",
        description: "무료 omni-moderation-latest로 피드 이미지+캡션과 공개 텍스트를 분류하되 AI 결과만으로 삭제·영구정지하지 않습니다.",
        behavior: "업로드 원본은 검사 전 비공개 격리하고 안전·검토·격리 세 단계로 처리합니다. 전쟁·보도·의료·예술·성소수자 관련 오탐과 이미지 미성년자 판정 한계를 사람 검토로 보완합니다.",
        completion: "API 키 등록, 개인정보 처리방침 최종 검토, 정상·경계 샘플 평가와 임계값 운영 승인이 필요합니다.",
        evidence: "uploads/router.py 이미지 사전 검사 · posts/service.py 텍스트 사전 검사 · governance/service.py omni-moderation-latest adapter · API 키 필요",
        technical: [
          ["텍스트", "혐오, 위협, 괴롭힘, 성적 콘텐츠, 자해, 폭력, 불법행위 조언 등의 boolean과 score를 저장합니다."],
          ["이미지", "성적 콘텐츠, 자해, 폭력·잔혹한 폭력을 지원하지만 불법 촬영 동의 여부나 실제 나이를 법적으로 확정하지 못합니다."],
          ["개인정보", "사용자 이미지·텍스트의 외부 처리를 처리방침에 고지하고 원문을 앱 로그에 남기지 않습니다."],
          ["장애", "공개 콘텐츠는 검사 대기 상태로 유지하고 관리자에게 공급자 장애를 알립니다."],
        ],
      },
      {
        title: "외부 서비스 준비표", status: "external",
        description: "코드 준비, 외부 가입, 자격증명, 연결 검증과 운영 활성화를 서로 다른 상태로 관리합니다.",
        behavior: "OpenAI·Resend·Turnstile·Vision은 관리자 키 메뉴, FCM·Play Integrity·Firebase SMS·Scheduler·PASS는 프로젝트·IAM·네이티브·계약 설정으로 관리합니다.",
        completion: "공급자별 어댑터·Disabled 구현체·설정 검증·Mock 테스트·상태 API가 필요하며 외부 등록 전에는 운영 활성로 표시하지 않습니다.",
        evidence: "외부 계정과 키는 아직 사용자 제공 전",
        technical: [
          ["OpenAI", "Moderation 무료, Platform API 키 필요. Free tier 호출 제한을 모니터링합니다."],
          ["Resend", "월 3,000통·일 100통 무료. API 키와 발송 도메인 인증이 필요합니다."],
          ["Turnstile", "무료 플랜을 사용하며 공개 Site Key와 서버 Secret Key를 분리합니다."],
          ["Google Vision", "월 1,000장 무료 후 SafeSearch 1,000장당 미화 1.50달러. OpenAI 경계 결과의 선택적 보조 수단입니다."],
          ["FCM·Expo", "푸시는 무료이나 Firebase/Expo 프로젝트와 Android 자격증명이 필요하며 기존 구현의 운영 설정을 감사합니다."],
          ["Play Integrity", "기본 일 10,000회이며 Play Console·Cloud 프로젝트·패키지·서명 연결이 필요해 키 메뉴 대상이 아닙니다."],
          ["Scheduler", "결제 계정당 월 3개 작업 무료이며 API 키가 아니라 IAM과 실제 작업 생성이 필요합니다."],
          ["SMS·PASS", "Firebase 한국 SMS는 매일 첫 10건 무료 후 건당 미화 0.01달러입니다. PASS/NICE/KCB는 계약·운영 승인·견적이 필요합니다."],
        ],
      },
      {
        title: "비용·할당량·장애 감시", status: "planned",
        description: "무료 한도 초과와 외부 장애가 사용자 피해나 예상 밖 과금으로 이어지지 않도록 공급자별 운영 지표를 제공합니다.",
        behavior: "일·월 호출량, 성공률, 지연, 마지막 오류와 예상 비용을 집계하고 무료 한도 70%·90% 경고, 비정상 급증 회로 차단과 안전 fallback을 적용합니다.",
        completion: "지표 저장·관리자 UI·경고 알림·회로 차단·재개 테스트가 필요합니다.",
        evidence: "외부 서비스 공통 quota/health 관리 미구현",
      },
      {
        title: "운영 범위 제외", status: "excluded",
        description: "불법 이미지 해시 매칭 시스템과 외부 전문 관제 서비스는 현재 운영 범위에서 제외합니다.",
        behavior: "제외 기능을 미완료로 표시하지 않으며 OpenAI 자동 분류, 사용자 신고, 내부 관리자 검토가 채택된 안전 체계임을 명시합니다.",
        completion: "범위 제외 결정 완료. 별도 승인 없이는 구현하거나 외부 계약을 진행하지 않습니다.",
        evidence: "사용자 결정: 불법 이미지 해시 시스템 및 전문 관제 서비스 제외",
      },
    ],
  },
];

const statusLabel = { implemented: "구현", verify: "검증 대기", risk: "주의", planned: "구현 예정", external: "외부 등록 대기", excluded: "범위 제외" };
const auditAuthBar = document.createElement("div");
auditAuthBar.className = "audit-auth-bar";
auditAuthBar.innerHTML = '<a href="/feature-audit/change-password">비밀번호 변경</a><a href="/feature-audit/logout">로그아웃</a>';
document.body.appendChild(auditAuthBar);
const average = Math.round(features.reduce((sum, feature) => sum + feature.score, 0) / features.length);
const summaryGrid = document.querySelector("#summaryGrid");
const featureSections = document.querySelector("#featureSections");
const sideNav = document.querySelector("#sideNav");
const priorityList = document.querySelector("#priorityList");

summaryGrid.innerHTML = features.map((feature) => `
  <article class="summary-card">
    <span class="index">${feature.number}</span><h3>${feature.title}</h3><p>${feature.label}</p>
    <div class="meter" aria-label="${feature.score}%"><span style="width:${feature.score}%"></span></div>
  </article>`).join("");

sideNav.innerHTML = `${features.map((feature) => `<a href="#${feature.id}">${feature.number} · ${feature.title}</a>`).join("")}<a href="#test-accounts">09 · 테스트 계정</a>`;
priorityList.innerHTML = features.map((feature, index) => `
  <li><span class="priority-rank">${String(index + 1).padStart(2, "0")}</span><div><strong>${feature.title}</strong><p>${feature.priority}</p></div><span class="status-pill status-${feature.status}">${feature.label}</span></li>`).join("");

featureSections.innerHTML = features.map((feature) => `
  <section class="section-block feature-section" id="${feature.id}" data-status="${feature.status}" data-search="${[feature.title, feature.summary, ...feature.capabilities.flatMap((item) => [item.title, item.description, item.behavior, ...(item.technical ? item.technical.flat() : [])])].join(" ").toLowerCase()}">
    <div class="section-heading"><div><span class="section-number">${feature.number}</span><h2>${feature.title}</h2></div><p>${feature.summary}</p></div>
    <div class="capability-list">
      ${feature.capabilities.map((item) => `
        <details class="capability" data-status="${item.status}">
          <summary><h3>${item.title}</h3><span class="status-pill status-${item.status}">${statusLabel[item.status]}</span></summary>
          <div class="capability-body"><p>${item.description}</p><div class="detail-grid"><div class="detail-card"><h4>실제 동작</h4><p>${item.behavior}</p></div><div class="detail-card"><h4>완료 판정</h4><p>${item.completion || (item.status === "implemented" ? "코드와 자동 검사에서 확인됨" : "코드 구현 완료, 통합·실기기 확인 필요")}</p></div></div>${item.technical ? `<details class="technical-details"><summary>기술 흐름 더 자세히 보기</summary><ol class="compression-flow">${item.technical.map(([title, body], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${title}</strong><p>${body}</p></div></li>`).join("")}</ol></details>` : ""}<div class="evidence"><strong>더 상세한 근거</strong><br />${item.evidence}</div></div>
        </details>`).join("")}
    </div>
  </section>`).join("");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character]));
const testData = window.AURAN_TEST_ACCOUNTS || { accounts: [], targets: {} };
const accountDashboard = document.querySelector("#testAccountDashboard");
const accountRows = testData.accounts || [];
const totalFeedPosts = accountRows.reduce((sum, account) => sum + Number(account.feedPosts || 0), 0);
const totalAnonymousPosts = accountRows.reduce((sum, account) => sum + Number(account.anonymousPosts || 0), 0);
accountDashboard.innerHTML = `
  <div class="credential-warning"><strong>테스트 전용 인증정보</strong><p>${escapeHtml(testData.warning || "외부에 공개하지 마세요.")}</p></div>
  <div class="test-data-summary">
    <article><strong>${accountRows.length}</strong><span>테스트 사용자</span></article>
    <article><strong>${totalFeedPosts}</strong><span>사진 피드</span></article>
    <article><strong>${totalAnonymousPosts}</strong><span>익명 글</span></article>
    <article><strong>${testData.generatedAt ? new Date(testData.generatedAt).toLocaleString("ko-KR") : "대기"}</strong><span>최종 생성</span></article>
  </div>
  <label class="account-search"><span>계정 검색</span><input id="accountSearch" type="search" placeholder="아이디 또는 닉네임" autocomplete="off" /></label>
  <div class="account-table-wrap">
    <table class="account-table">
      <thead><tr><th>계정</th><th>비밀번호</th><th>닉네임</th><th>피드</th><th>익명</th><th>상태</th></tr></thead>
      <tbody>${accountRows.length ? accountRows.map((account) => `
        <tr data-account-search="${escapeHtml(`${account.username} ${account.nickname}`.toLowerCase())}">
          <td><code>${escapeHtml(account.username)}</code><button class="copy-credential" type="button" data-copy="${escapeHtml(account.username)}">복사</button></td>
          <td><span class="password-cell"><input type="password" readonly value="${escapeHtml(account.password)}" aria-label="${escapeHtml(account.username)} 비밀번호" /><button class="toggle-password" type="button">표시</button><button class="copy-credential" type="button" data-copy="${escapeHtml(account.password)}">복사</button></span></td>
          <td>${escapeHtml(account.nickname)}</td><td>${Number(account.feedPosts || 0)}/15</td><td>${Number(account.anonymousPosts || 0)}/1</td><td><span class="status-pill ${account.status === "완료" ? "status-implemented" : "status-verify"}">${escapeHtml(account.status)}</span></td>
        </tr>`).join("") : `<tr><td colspan="6" class="account-empty">테스트 데이터 생성 결과가 아직 없습니다.</td></tr>`}</tbody>
    </table>
  </div>`;

document.querySelector("#accountSearch")?.addEventListener("input", (event) => {
  const query = event.currentTarget.value.trim().toLowerCase();
  document.querySelectorAll(".account-table tbody tr[data-account-search]").forEach((row) => {
    row.classList.toggle("hidden", query && !row.dataset.accountSearch.includes(query));
  });
});
accountDashboard.addEventListener("click", async (event) => {
  const toggleButton = event.target.closest(".toggle-password");
  if (toggleButton) {
    const input = toggleButton.parentElement.querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
    toggleButton.textContent = input.type === "password" ? "표시" : "숨김";
    return;
  }
  const copyButton = event.target.closest(".copy-credential");
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.copy);
      const toast = document.querySelector("#toast");
      toast.textContent = "계정 정보를 복사했습니다.";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    } catch {
      document.querySelector("#toast").textContent = "복사할 수 없습니다.";
    }
  }
});

document.querySelector("#scoreValue").textContent = average;
document.querySelector("#scoreRing").style.setProperty("--score", `${average * 3.6}deg`);

let activeFilter = "all";
const applyFilters = () => {
  const query = document.querySelector("#featureSearch").value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll(".feature-section").forEach((section) => {
    const matchesQuery = !query || section.dataset.search.includes(query);
    const matchesStatus = activeFilter === "all" || section.dataset.status === activeFilter || [...section.querySelectorAll(".capability")].some((item) => item.dataset.status === activeFilter);
    section.classList.toggle("hidden", !(matchesQuery && matchesStatus));
    if (matchesQuery && matchesStatus) visible += 1;
  });
  let empty = document.querySelector(".no-results");
  if (!visible && !empty) { empty = document.createElement("div"); empty.className = "no-results"; empty.textContent = "조건에 맞는 기능이 없습니다."; featureSections.appendChild(empty); }
  if (visible && empty) empty.remove();
};
document.querySelector("#featureSearch").addEventListener("input", applyFilters);
document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".filter-chip").forEach((item) => item.classList.remove("active")); button.classList.add("active"); activeFilter = button.dataset.filter; applyFilters(); }));

let expanded = false;
document.querySelector("#expandAll").addEventListener("click", (event) => { expanded = !expanded; document.querySelectorAll("details").forEach((item) => { item.open = expanded; }); event.currentTarget.textContent = expanded ? "모두 접기" : "모두 펼치기"; });
document.querySelector("#printReport").addEventListener("click", () => window.print());
document.querySelector("#copySummary").addEventListener("click", async () => {
  const text = features.map((feature) => `${feature.number}. ${feature.title}: ${feature.label} (${feature.score}%)`).join("\n");
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    const toast = document.querySelector("#toast"); toast.textContent = "요약을 복사했습니다."; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 1800);
  } catch { document.querySelector("#toast").textContent = "복사할 수 없습니다."; }
});

const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { document.querySelectorAll("#sideNav a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`)); } }); }, { rootMargin: "-30% 0px -60%", threshold: 0 });
document.querySelectorAll(".feature-section").forEach((section) => observer.observe(section));
