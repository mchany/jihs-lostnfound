# 중일분실물DB
![Student Project](https://img.shields.io/badge/STUDENT-PROJECT-0ea5e9?style=for-the-badge&logo=bookstack&logoColor=white)
[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-ONLINE-2ea043?style=for-the-badge&logo=googlechrome&logoColor=white)](https://jihs-lostnfound.pages.dev)
![Cloudflare Pages](https://img.shields.io/badge/CLOUDFLARE_PAGES-F38020?style=for-the-badge&logo=cloudflarepages&logoColor=white)

분실·습득 게시판, 상세 페이지, 댓글 기능을 제공하는 학교 분실물 관리 사이트입니다. 로컬 개발은 Node.js 서버를 사용하고, Cloudflare Pages 배포에서는 Pages Functions가 API를 처리하며 D1과 R2에 게시물·댓글·사진을 저장합니다.

## 로컬 실행

Node.js 18 이상에서 이 폴더에서 실행합니다.

```sh
npm start
```

브라우저에서 `http://localhost:3000`을 여세요. 로컬 게시물과 사진은 `data/posts.json` 및 `uploads/`에 저장됩니다.

## Cloudflare Pages 배포

### 1. Pages 프로젝트 만들기

Cloudflare 대시보드에서 Workers & Pages → Create application → Pages → Connect to Git을 선택하고 `mchany/jihs-lostnfound` 저장소의 `main` 브랜치를 연결합니다. 빌드 명령은 비워 두고 빌드 출력 디렉터리를 `.`로 설정합니다. 저장소의 `wrangler.toml`은 Pages 설정 파일입니다.

### 2. D1 데이터베이스 만들기

Workers & Pages → D1 SQL Database에서 `jungil-lost-and-found` 데이터베이스를 만듭니다. D1 콘솔에서 [`cloudflare/schema.sql`](cloudflare/schema.sql)을 실행합니다.

### 3. R2 버킷 만들기

R2 Object Storage에서 `jungil-lost-and-found-images` 버킷을 만듭니다. 사진은 R2에 비공개로 저장되고 Pages Function이 `/uploads/...` 경로로 전달하므로 공개 버킷이나 공개 도메인이 필요하지 않습니다.

### 4. Pages Function에 리소스와 secret 연결

Pages 프로젝트의 Settings → Functions → Bindings에서 두 바인딩을 추가합니다.

- D1 database: 변수 이름 `DB`, 위에서 만든 데이터베이스 선택
- R2 bucket: 변수 이름 `IMAGES`, 위에서 만든 버킷 선택

Settings → Variables and Secrets에서 `PASSWORD_PEPPER`를 Secret으로 추가합니다. 값은 32자 이상의 임의 문자열로 만들고 GitHub에 커밋하거나 공개하지 마세요. 이 키는 게시물과 댓글 비밀번호 해시에 사용됩니다. Production 환경에 리소스와 secret을 연결한 뒤 프로젝트를 다시 배포합니다. 미리 보기 배포에서도 확인하려면 Preview 환경에도 같은 설정을 연결하세요.

이제 Cloudflare가 제공하는 `*.pages.dev` 주소에서 게시물을 등록해 확인합니다. GitHub Pages 주소는 정적 파일만 제공하므로 API는 실행하지 않습니다. Cloudflare 배포 확인 후 Pages 주소를 새 서비스 주소로 바꾸거나, 사용자에게 Cloudflare 주소를 공유하세요.

## 사용

- 분실 게시물은 분실 장소만 입력하고, 습득 게시물은 습득 장소와 보관 장소를 입력합니다.
- 게시물 게시 전 Cloudflare Turnstile를 완료/통과해야 게시가 가능합니다.
- 간단 설명은 목록에 표시하고 상세 설명은 게시물 상세 페이지에서 확인합니다.
- 분실 게시물에는 닉네임과 비밀번호를 설정해 댓글을 달 수 있으며, 댓글 작성자는 닉네임과 비밀번호로 댓글을 수정·삭제할 수 있습니다. 기존 비밀번호 없는 댓글은 새 API가 처음 실행될 때 모두 제거됩니다.
- 수정, 삭제, '주인을 찾았어요'는 게시물 등록 시 설정한 비밀번호로 확인합니다.
- '주인을 찾았어요' 처리 후 한달이 지난 게시물은 자동 삭제됩니다.
- 다크 모드는 테마 버튼으로 전환합니다.

## 코드 구성

- `js/`: 브라우저 UI와 API 호출 모듈
- `server/`: 로컬 Node 서버의 저장, 입력 검증, 비밀번호 모듈
- `functions/api/`: Cloudflare Pages 게시물 API
- `functions/uploads/`: R2 사진 조회 API
- `cloudflare/schema.sql`: D1 테이블 구성
- `server.js`: 로컬 개발 서버
- `wrangler.toml`: Cloudflare Pages 설정

## 이미지 및 로고 이용 안내

이 저장소의 소스 코드는 별도 표시가 없는 한 MIT License를 따릅니다. MIT License는 이미지와 로고에는 적용되지 않습니다.

`school-emblem.png`, `school-emblem-dark.png`, `thumbnail.png` 등 저장소에 포함된 로고와 이미지는 각 저작권자 또는 권리자에게 권리가 있습니다. 저장소에 포함되어 있다는 사실만으로 해당 자료의 복제, 수정, 재배포 또는 상업적 이용을 허가하는 것은 아닙니다.

이 자료를 이용하려면 해당 권리자로부터 허가를 받거나, 자료별로 명시된 별도 라이선스를 확인해 주세요. 권리 및 이용 허가 여부가 확인되지 않은 자료는 허가 없이 재사용하지 마세요.

## 이미지 및 로고 출처

| 파일 | 출처 | 권리자 | 이용 조건 |
|---|---|---|---|
| `school-emblem.png` | [중일고등학교](https://jungilhs.djsch.kr) | [Copyrightⓒ 중일고등학교. All rights reserved.](https://jungilhs.djsch.kr) | 허가 여부 확인 전 재사용 금지 |
| `school-emblem-dark.png` | `school-emblem.png`의 다크 모드용 변형 | 원본과 동일 | 원본과 동일 |
| `thumbnail.png` | `school-emblem.png` 이용 직접 제작 | 원본과 동일 | 원본과 동일 |
