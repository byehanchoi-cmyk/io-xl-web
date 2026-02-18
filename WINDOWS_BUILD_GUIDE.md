# Windows 버전 빌드 및 실행 가이드 (Building for Windows)

이 문서는 `XL-Compare` 애플리케이션을 Windows 환경에서 빌드하고 실행 파일(.exe)을 생성하는 방법을 설명합니다.

> **중요:** `better-sqlite3`와 같은 네이티브 모듈을 사용하므로, macOS에서 Windows용 버전을 크로스 컴파일하는 것은 매우 어렵습니다. 가장 확실한 방법은 Windows 환경에서 직접 빌드하는 것입니다.

## 1. 사전 준비 (Prerequisites)

Windows PC에 다음이 설치되어 있어야 합니다:

1.  **Node.js**: 최신 LTS 버전 권장 (v18 이상)
    *   [Node.js 다운로드](https://nodejs.org/)
2.  **Git**: 소스 코드를 내려받기 위해 필요
    *   [Git 다운로드](https://git-scm.com/)
3.  **Visual Studio Build Tools** (네이티브 모듈 컴파일용)
    *   `better-sqlite3` 빌드를 위해 필요할 수 있습니다.
    *   설치 시 "C++를 사용한 데스크톱 개발" 워크로드를 선택하세요.
    *   또는 터미널(관리자 권한)에서 다음 명령어로 설치 가능:
        ```ps1
        npm install --global windows-build-tools
        ```

---

## 2. 소스 코드 가져오기 (Clone Repository)

GitHub에 업로드된 프로젝트를 Windows PC로 복제합니다.

```bash
git clone https://github.com/Byeonghan-CHOI/IO_XL-WEB.git
cd IO_XL-WEB
```

---

## 3. 의존성 설치 (Install Dependencies)

프로젝트 폴더 내에서 다음 명령어를 실행하여 필요한 패키지를 설치합니다.

```bash
npm install --legacy-peer-deps
```

> **참고:** `--legacy-peer-deps` 옵션은 일부 패키지 간의 버전 충돌을 해결하기 위해 필요할 수 있습니다.

---

## 4. Windows 실행 파일 빌드 (Build for Windows)

다음 명령어를 실행하여 설치 파일(.exe)과 실행 가능한 포터블 버전을 생성합니다.

```bash
npm run build:win
```

### 빌드 결과물 위치
빌드가 성공적으로 완료되면 `release` 폴더 내에 결과물이 생성됩니다.

*   `release/XL-Compare-1.0.0.exe` (설치 파일)
*   `release/win-unpacked/XL-Compare.exe` (설치 없이 바로 실행 가능한 파일)

---

## 5. 최신 업데이트 사항 (Latest Updates)

### 윈도우 메인바 자동 숨김 기능 (Auto-hide Main Bar)
사용자 편의를 위해 윈도우 버전에서는 상단 메인바가 자동으로 숨겨지도록 개선되었습니다.
*   **동작 방식:** 마우스 커서를 화면 최상단(12px 영역)으로 가져가면 메인바가 나타납니다.
*   **숨김 조건:** 마우스가 메인바 영역을 벗어나면 1초 뒤에 자동으로 부드럽게 사라집니다.
*   **이점:** 분석 데이터 그리드를 더 넓은 화면에서 확인할 수 있습니다.

---

## 6. 문제 해결 (Troubleshooting)

### Q1. `better-sqlite3` 관련 에러가 발생해요.
*   **원인:** 네이티브 모듈 컴파일 실패
*   **해결:**
    1.  `node_modules` 폴더를 삭제합니다 (`rm -rf node_modules`).
    2.  `Python`과 `Visual Studio Build Tools`가 설치되어 있는지 확인합니다.
    3.  `npm install --legacy-peer-deps`를 다시 실행하여 재컴파일을 시도합니다.

### Q2. `electron-builder` 에러가 발생해요.
*   **해결:** `npm run build:win` 대신 다음 단계를 순서대로 실행해 보세요.
    ```bash
    npm run build       # Vite 빌드
    npx electron-builder --win  # Electron 패키징
    ```
