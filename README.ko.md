# 시트뷰 (Sheetview)

[English](README.md) | **한국어**

CSV, Excel, 한셀 문서를 살펴보는 가벼운 오픈소스 뷰어입니다. 웹과 Windows 설치 앱에서 사용할 수 있습니다. 파일은 서버로 전송하지 않고 사용자의 기기에서 읽습니다. 편집이나 저장 기능은 없습니다.

## 사용하기

[GitHub Releases](https://github.com/jwjp/sheetviewer/releases)에서 Windows 설치 파일을 내려받아 설치하거나, 브라우저에서 `docs/index.html` 또는 [온라인 뷰어](https://jwjp.github.io/sheetviewer/)를 여세요. 파일 선택 버튼을 누르거나 파일을 화면에 끌어다 놓으면 됩니다. 설치 앱은 인터넷 연결 없이 사용할 수 있으며 WebView2가 필요합니다. Windows 10/11에는 보통 WebView2가 설치되어 있고, 없으면 설치 프로그램이 설치를 안내합니다.

| 형식 | 상태 |
| --- | --- |
| `.csv`, `.tsv`, `.txt` | 지원 (UTF-8, UTF-16, 한국어 EUC-KR/CP949 계열) |
| `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.ods` | 지원 |
| 한셀 `.cell` | 셀 값·수식·단색 배경, 삽입된 그림과 도형 텍스트 보기. 원본 서식과 배치는 간소화됩니다. |

`.cell`이 열리지 않으면 한셀에서 **파일 → 다른 이름으로 저장 → Excel 통합 문서(.xlsx)** 또는 CSV를 선택한 후 변환된 파일을 열어 주세요. 한컴의 [한셀 도움말](https://help.hancom.com/hoffice/webhelp/9.0/en_us/hcell/file/save_as/save_as.htm)도 이 저장 형식을 안내합니다. 한셀 전용 글자 서식과 도형 배치는 원본처럼 재현되지 않습니다.

한셀 2016 폴더의 정상 `.cell` 문서 95개를 일괄 검사했습니다. 모든 문서의 시트를 열 수 있었고, 값이 없는 양식도 열립니다. 셀 배경색으로 만든 픽셀아트도 표시합니다. 같은 폴더의 숨김 임시 파일 1개는 실제 통합 문서가 아니어서 검사에서 제외했습니다. 이 검사는 모든 한셀 버전의 동일한 표시 품질을 보장하지 않습니다. 사용자 파일은 저장소와 앱에 포함하지 않았습니다.

## 기능

- 여러 시트 전환, 셀 선택 및 수식 확인
- 한셀 문서에 삽입된 그림과 도형 텍스트를 시트별로 확인
- 한셀 문서의 단색 셀 배경 표시, 색상 셀 문서용 촘촘한 그리드
- 시트 안에서 값 검색, 이전/다음 결과 이동
- 큰 시트를 위한 세로 가상 스크롤
- 한국어 CSV 인코딩 자동 판별, 탭/세미콜론/파이프 구분자 감지
- 웹 버전은 설치 없이, Windows 앱은 오프라인에서 사용 가능

현재 한 파일 최대 30MB, 화면 표시 범위는 첫 100,000행 × 200열입니다. 수식은 재계산하지 않고 파일에 저장된 값을 표시합니다. 차트는 자리만 안내하며 그래프를 그리지 않습니다. 무늬 채우기, 텍스트가 없는 도형, 피벗 테이블, 원본 서식과 정확한 배치는 표시하지 않습니다. 악성 문서의 매크로는 실행하지 않습니다.

## 로컬 실행

빌드나 의존성 설치는 필요 없습니다. `docs/index.html`을 직접 열거나 로컬 서버를 사용하세요.

```sh
python -m http.server 8000 --directory docs
```

그다음 `http://localhost:8000`을 방문합니다.

## Windows 앱 빌드

빌드 PC에는 [Rust MSVC 툴체인, Microsoft C++ Build Tools, WebView2](https://tauri.app/start/prerequisites/)와 Node.js가 필요합니다. 저장소 루트에서 실행하세요.

```sh
npm ci
npm run desktop:build
```

완료되면 `src-tauri/target/release/bundle/nsis/`에 Windows 설치 파일(`-setup.exe`)이 생성됩니다. 앱 화면은 웹 버전과 동일한 `docs` 파일을 내장합니다. 아이콘을 변경하려면 Pillow를 설치한 뒤 `python scripts/generate_icons.py`를 실행하세요.

현재 배포 파일에는 코드 서명이 적용되지 않았습니다. Windows에서 SmartScreen 경고가 나타날 수 있으므로 GitHub Releases의 게시자와 파일 해시를 확인하세요.

## 웹 배포

`main` 브랜치의 `docs` 폴더가 GitHub Pages의 게시 소스입니다. `docs` 파일을 변경하여 푸시하면 GitHub Pages가 새 버전을 게시합니다.

## 개발

정적 HTML/CSS/JavaScript 화면과 Tauri 2 데스크톱 셸로 구성됩니다. 화면은 `docs/index.html`, 스타일은 `docs/style.css`, 파일 처리와 표 렌더링은 `docs/app.js`에 있습니다. Windows 앱 설정은 `src-tauri/tauri.conf.json`에 있습니다. 화면 변경 후 웹과 설치 앱을 모두 확인하세요.

코드 주석과 기본 문서는 영어로 작성하고, 한국어 번역은 해당 `.ko.md` 파일에 유지합니다.

한셀 폴더를 일괄 검사하려면 `node scripts/audit-cell.mjs "한셀 파일 폴더"`를 실행하세요. 이 명령은 셀 값은 출력하지 않고 문서·시트·수식 수와 열기 오류만 보고합니다.

변경 사항은 [변경 기록](CHANGELOG.ko.md)에서 확인할 수 있습니다.

스프레드시트 파싱에는 [SheetJS Community Edition 0.20.3](https://docs.sheetjs.com/docs/miscellany/formats/)을 사용합니다. 배포 파일은 `docs/vendor/xlsx.full.min.js`에 포함되어 있으며 Apache-2.0 라이선스 전문은 `docs/vendor/LICENSE.sheetjs.txt`에 있습니다.

## 기여

오류 재현이 가능한 샘플 파일은 민감 정보를 지운 뒤 이슈에 첨부해 주세요. 특히 `.cell` 형식 지원을 개선하려면 실제 파일과 기대하는 셀 값이 필요합니다. PR도 환영합니다.

## 라이선스

시트뷰 코드는 [MIT](LICENSE) 라이선스로 공개합니다. 포함된 SheetJS는 Apache-2.0 라이선스를 따릅니다.
