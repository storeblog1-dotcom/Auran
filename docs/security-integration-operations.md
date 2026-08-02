# 관리자 외부 연동·비밀키 운영 가이드

현재 배포는 Google Secret Manager가 아니라 GitHub Actions Secrets에서 서버 전용 값을 Cloud Run 환경변수로 전달합니다. 비밀 원문은 코드, APK, 문서와 API 응답에 넣지 않습니다.

## 권한

- `moderator`: 신고 조회와 검토
- `admin`: 회원·콘텐츠·제재·이의신청 처리
- `superadmin`: 위 권한과 비밀키 등록·회전·폐기, 관리자 권한 변경
- 비밀키 변경 전에는 최고 관리자 비밀번호 재인증이 필요합니다.

## 최초 부트스트랩

다음 값은 앱이나 관리자 화면에 입력하지 않고 GitHub Actions Secrets에서 Cloud Run 환경변수로 주입합니다.

- `INTEGRATION_MASTER_KEY`: URL-safe base64로 인코딩한 무작위 32바이트 키
- `INSTALLATION_HMAC_SECRET`: 설치 식별자 HMAC 전용 무작위 비밀
- `FEATURE_AUDIT_INITIAL_PASSWORD`: 기능 구현 감사 페이지를 초기화할 때만 쓰는 임시 비밀번호
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`: 최고 관리자 최초 생성이 정말 필요한 환경에서만 임시 등록

부트스트랩 최고 관리자가 만들어진 뒤에는 세 관리자 환경변수를 제거해도 기존 계정은 유지됩니다. 소스 코드, GitHub 저장소, APK, 프론트 환경변수, AsyncStorage, 로그 또는 지원 티켓에 값을 복사하지 않습니다.

## 기능 구현 감사 페이지

- 운영 경로는 `/feature-audit`이며 HTML, CSS, JavaScript와 테스트 계정 자료까지 인증 뒤에 둡니다.
- 초기 비밀번호는 `FEATURE_AUDIT_INITIAL_PASSWORD`로 주입하고 최초 로그인 직후 변경합니다.
- DB에는 bcrypt 해시만 저장하며 앱 Superadmin 비밀번호와 별개입니다.
- 새 비밀번호를 설정하거나 초기화하면 기존 감사 페이지 세션이 모두 무효화됩니다.
- 비밀번호를 잊으면 앱의 Superadmin 전용 외부 연동 메뉴에서 앱 관리자 비밀번호를 재입력하고 초기화합니다.

## 공급자 키 등록

1. 공급자 콘솔에서 서버 전용 자격증명을 발급합니다.
2. 개인정보 처리방침에 처리 목적·전송 항목·보존 정책을 반영합니다.
3. 앱 관리자 대시보드의 `외부 연동`에서 공급자를 선택합니다.
4. 새 키와 최고 관리자 비밀번호를 입력합니다.
5. 저장 후 키 입력값은 화면 상태에서 제거되며 전체 값은 다시 표시되지 않습니다.
6. `연결 검사`를 실행합니다.
7. OpenAI Moderation은 자동 제재 없이 Shadow Mode 자료를 먼저 검토합니다.
8. 오탐·할당량·장애 대응을 확인한 뒤 `활성화`합니다.

DB에는 AES-GCM 인증 암호화 결과, nonce, 키 버전, HMAC fingerprint와 마지막 네 글자만 저장합니다. 마스터 키가 없거나 연결 검사에 성공하지 않은 키는 활성화할 수 없습니다.

## 회전·사고 대응

1. 공급자 콘솔에서 새 키를 만듭니다.
2. 관리자 메뉴에서 새 키를 등록하면 기존 활성 상태는 자동으로 꺼집니다.
3. 새 키 연결 검사 후 다시 활성화합니다.
4. 정상 호출을 확인한 뒤 공급자 콘솔에서 이전 키를 폐기합니다.
5. 유출이 의심되면 즉시 연동을 비활성화하고 공급자 키를 폐기한 뒤 감사기록과 호출량을 확인합니다.

## 키 입력만으로 끝나지 않는 서비스

- FCM·Expo Push: Firebase/Expo 프로젝트와 Android 자격증명 필요
- Play Integrity: Play Console, Cloud 프로젝트, 패키지명과 앱 서명 연결 필요
- Cloud Scheduler: Google Cloud IAM 및 실제 예약 작업 생성 필요
- Firebase SMS: 결제·발신 정책·지역별 제한 확인 필요
- PASS/NICE/KCB: 사업자 계약과 운영 승인 필요

이 서비스는 관리자 키 입력 메뉴에서 억지로 활성화하지 않고 `외부 설정 대기/검증/운영` 상태로 관리합니다.
