# 시트뷰 (Sheetview)

CSV, Excel, 한셀 문서를 살펴보는 가벼운 오픈소스 웹 뷰어입니다. 파일은 서버로 전송하지 않고 브라우저에서 읽습니다. 편집이나 저장 기능은 없습니다.

## 사용하기

브라우저에서 `dist/index.html`을 열거나, [온라인 뷰어](https://jwjp.github.io/sheetviewer/)를 이용하세요. 파일 선택 버튼을 누르거나 파일을 화면에 끌어다 놓으면 됩니다.

| 형식 | 상태 |
| --- | --- |
| `.csv`, `.tsv`, `.txt` | 지원 (UTF-8, UTF-16, 한국어 EUC-KR/CP949 계열) |
| `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.ods` | 지원 |
| 한셀 `.cell` | 내부 형식이 호환되는 파일은 열기를 시도합니다. 한셀 고유 형식은 직접 읽지 못할 수 있습니다. |

`.cell`이 열리지 않으면 한셀에서 **파일 → 다른 이름으로 저장 → Excel 통합 문서(.xlsx)** 또는 CSV를 선택한 후 변환된 파일을 열어 주세요. 한컴의 [한셀 도움말](https://help.hancom.com/hoffice/webhelp/9.0/en_us/hcell/file/save_as/save_as.htm)도 이 저장 형식을 안내합니다. 현재 공개된 SheetJS 지원 형식 목록에는 한셀 고유 `.cell`이 없어 모든 `.cell` 파일의 호환성을 보장할 수 없습니다.

## 기능

- 여러 시트 전환, 셀 선택 및 수식 확인
- 시트 안에서 값 검색, 이전/다음 결과 이동
- 큰 시트를 위한 세로 가상 스크롤
- 한국어 CSV 인코딩 자동 판별, 탭/세미콜론/파이프 구분자 감지
- 설치나 계정 없이 사용 가능

현재 한 파일 최대 30MB, 화면 표시 범위는 첫 100,000행 × 200열입니다. 수식은 재계산하지 않고 파일에 저장된 값을 표시합니다. 차트, 이미지, 피벗 테이블 등은 표시하지 않습니다. 악성 문서의 매크로는 실행하지 않습니다.

## 로컬 실행

빌드나 의존성 설치는 필요 없습니다. `dist/index.html`을 직접 열거나 로컬 서버를 사용하세요.

```sh
python -m http.server 8000 --directory dist
```

그다음 `http://localhost:8000`을 방문합니다.

## 배포

`main` 브랜치로 푸시하면 GitHub Actions가 `dist` 폴더를 GitHub Pages에 배포합니다. 저장소의 **Settings → Pages → Build and deployment**에서 소스를 **GitHub Actions**로 설정해야 합니다.

## 개발

정적 HTML/CSS/JavaScript 프로젝트입니다. 화면은 `dist/index.html`, 스타일은 `dist/style.css`, 파일 처리와 표 렌더링은 `dist/app.js`에 있습니다. 변경 후 브라우저에서 직접 확인할 수 있습니다.

스프레드시트 파싱에는 [SheetJS Community Edition 0.20.3](https://docs.sheetjs.com/docs/miscellany/formats/)을 사용합니다. 배포 파일은 `dist/vendor/xlsx.full.min.js`에 포함되어 있으며 Apache-2.0 라이선스 전문은 `dist/vendor/LICENSE.sheetjs.txt`에 있습니다.

## 기여

오류 재현이 가능한 샘플 파일은 민감 정보를 지운 뒤 이슈에 첨부해 주세요. 특히 `.cell` 형식 지원을 개선하려면 실제 파일과 기대하는 셀 값이 필요합니다. PR도 환영합니다.

## 라이선스

시트뷰 코드는 [MIT](LICENSE) 라이선스로 공개합니다. 포함된 SheetJS는 Apache-2.0 라이선스를 따릅니다.
