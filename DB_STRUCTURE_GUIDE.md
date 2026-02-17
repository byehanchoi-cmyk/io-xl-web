# DB 구조 및 연계 가이드 (XL-COMPARE)

이 문서는 `XL-COMPARE` 애플리케이션에서 사용하는 로컬 데이터베이스(SQLite)의 위치, 테이블 구조, 그리고 애플리케이션과의 연동 방식을 설명합니다.

## 1. 데이터베이스 위치 (Database Location)

애플리케이션은 로컬 파일 기반의 **SQLite** 데이터베이스를 사용합니다.

- **파일 이름:** `engineering_io.db`
- **저장 경로 (OS별 기본 경로):** Electron의 `app.getPath('userData')` 경로에 저장됩니다.
  - **macOS:** `~/Library/Application Support/XL-COMPARE/engineering_io.db`
  - **Windows:** `%APPDATA%\XL-COMPARE\engineering_io.db`
  - **Linux:** `~/.config/XL-COMPARE/engineering_io.db`

> **참고:** 개발 모드(`npm run dev`)에서는 실행되는 프로젝트의 명칭(예: `Electron` 등)에 따라 폴더명이 다를 수 있습니다.

---

## 2. 테이블 명세 (Tables Specification)

총 4개의 주요 테이블이 정의되어 있습니다.

### 2.1. 프로젝트 히스토리 (`projects_history`)
최근 작업한 분석 프로젝트의 이력을 저장합니다. 초기 화면의 "Recent Analysis History" 목록에 사용됩니다.

| 컬럼명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | 고유 ID (Auto Increment) |
| `name` | TEXT | 프로젝트 표시 이름 (예: `RefFile ↔ CompFile`) |
| `ref_path` | TEXT | 기준(Reference) 파일 절대 경로 |
| `comp_path` | TEXT | 비교(Comparison) 파일 절대 경로 |
| `config_json` | TEXT | 분석 설정 JSON (컬럼 매핑, 제외 규칙 등) |
| `last_modified`| DATETIME | 마지막 수정 시간 (정렬 기준) |

### 2.2. 사용자 메모 (`user_memos`)
그리드 내 특정 행/열에 사용자가 입력한 메모를 저장합니다.

| 컬럼명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | 고유 ID |
| `row_key` | TEXT | 행 식별자 (PK 값) |
| `col_id` | TEXT | 컬럼 ID |
| `text` | TEXT | 메모 내용 |
| `updated_at` | DATETIME | 업데이트 시간 |
| **제약조건** | UNIQUE | `(row_key, col_id)` 조합은 유일해야 함 |

### 2.3. 분석 규칙 (`analysis_rules`)
사용자가 저장한 분석 규칙 설정을 저장합니다. (현재 기능 확장 대비용)

| 컬럼명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | 고유 ID |
| `name` | TEXT | 규칙 이름 |
| `type` | TEXT | 규칙 유형 |
| `rule_json` | TEXT | 규칙 상세 내용 (JSON) |

### 2.4. 매핑 지능 (`mapping_intelligence`)
사용자가 수동으로 매핑한 컬럼 정보를 학습하여 저장합니다. "스마트 매핑" 추천 기능에 사용됩니다.

| 컬럼명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | 고유 ID |
| `ref_col` | TEXT | 기준 파일 컬럼명 |
| `comp_col` | TEXT | 비교 파일 컬럼명 |
| `use_count` | INTEGER | 사용 빈도수 (추천 우선순위 결정) |
| `last_used` | DATETIME | 마지막 사용 시간 |

---

## 3. 연계 방법 (Integration Method)

애플리케이션은 **Electron IPC (Inter-Process Communication)** 패턴을 사용하여 렌더러(UI) 프로세스와 메인(DB) 프로세스 간 통신을 수행합니다.

### 3.1. 아키텍처 흐름
1.  **UI (React):** `window.electron` 객체(Preload 스크립트를 통해 노출됨)를 통해 DB 요청을 보냅니다.
2.  **IPC Bridge:** `electron/preload.ts`가 요청을 중계합니다.
3.  **Main Process:** `electron/main.ts`에서 `better-sqlite3` 라이브러리를 사용하여 실제 DB 쿼리를 수행합니다.

### 3.2. 주요 IPC 채널 (API)

개발 시 사용할 수 있는 주요 IPC 채널은 다음과 같습니다.

| 기능 | 채널명 (`invoke`) | 파라미터 | 리턴값 |
| :--- | :--- | :--- | :--- |
| **[프로젝트]** 저장 | `db-save-project` | `{ name, refPath, compPath, configJson }` | 성공 여부 |
| **[프로젝트]** 조회 | `db-get-projects` | 없음 | 프로젝트 목록 배열 |
| **[프로젝트]** 삭제 | `db-delete-project` | `id` | 성공 여부 |
| **[메모]** 저장 | `db-save-memo` | `{ rowKey, colId, text }` | 성공 여부 |
| **[메모]** 조회 | `db-get-memos` | 없음 | 메모 목록 배열 |
| **[매핑]** 학습 저장 | `db-save-mapping-intel` | `{ refCol, compCol }` | 성공 여부 |
| **[매핑]** 추천 조회 | `db-get-mapping-intel` | 없음 | 학습된 매핑 목록 (빈도순) |

### 3.3. 코드 예시

**Front-end (React)에서 DB 호출 예시:**

```typescript
// 프로젝트 이력 저장하기
const saveHistory = async () => {
  const projectData = {
    name: "Project A",
    refPath: "/path/to/ref.xlsx",
    compPath: "/path/to/comp.xlsx",
    configJson: JSON.stringify(currentConfig)
  };
  
  // IPC 호출
  await window.electron.saveProject(projectData);
};
```
