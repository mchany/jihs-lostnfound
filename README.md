# 중일분실물DB

분실·습득 게시판, 상세 페이지, 댓글을 제공하는 학교 분실물 관리 사이트입니다. Node.js 서버가 웹 화면과 게시물 API를 함께 제공합니다. GitHub Pages 같은 정적 호스팅만으로는 게시물 저장 API를 실행할 수 없습니다.

## 로컬 실행

Node.js 18 이상에서 이 폴더에 들어와 실행합니다.

```sh
npm start
```

브라우저에서 `http://localhost:3000`을 여세요. Supabase 환경 변수가 없으면 게시물과 사진은 로컬 `data/posts.json` 및 `uploads/`에 저장됩니다.

## 무료 배포 구성

배포는 Render의 Node.js 웹 서비스와 Supabase의 PostgreSQL·Storage를 사용합니다. Supabase Free에는 데이터베이스 500 MB와 파일 1 GB가 포함되지만, 1주일 동안 활동이 없으면 프로젝트가 일시 중지될 수 있습니다. Render Free 웹 서비스는 15분 동안 요청이 없으면 잠들고, 깨어나는 데 약 1분이 걸릴 수 있습니다. [Supabase 요금 및 한도](https://supabase.com/pricing) · [Render Free 제한](https://render.com/docs/free)

1. Supabase에서 프로젝트를 만들고 SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다.
2. Supabase Storage에서 `lost-found-images`라는 **public bucket**을 만듭니다. 최대 파일 크기는 5 MB, 허용 MIME 형식은 JPEG, PNG, WEBP, GIF로 설정합니다. 사진은 게시물에 표시되므로 공개 URL로 제공됩니다.
3. Supabase의 Project URL과 서버 전용 Secret API key를 준비합니다. 새 Secret key(`sb_secret_...`) 또는 기존 `service_role` key를 쓸 수 있습니다. 키는 프런트엔드 코드나 GitHub 파일에 넣지 마세요.
4. GitHub 저장소를 Render에 연결해 Blueprint를 생성합니다. 이 저장소의 [`render.yaml`](render.yaml)이 무료 웹 서비스를 설정합니다. Blueprint가 요청하면 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 입력하고 배포합니다. Storage bucket 이름은 기본값 `lost-found-images`를 사용합니다.
5. 배포된 Render 주소를 열어 게시판과 API가 응답하는지 확인합니다. 이후 같은 저장소의 커밋을 Render가 자동 배포합니다.

서비스 키는 서버에서만 읽으며 Supabase 요청의 서버 전용 헤더로 사용합니다. 두 테이블은 RLS를 켜고 브라우저에서 직접 읽거나 쓰는 정책을 두지 않았습니다. 로컬 파일 저장은 개발용 fallback이고, 배포 시 두 Supabase 환경 변수를 모두 설정해야 클라우드 DB와 Storage를 사용합니다.

## 사용

- 분실 게시물은 분실 장소만 입력하고, 습득 게시물은 습득 장소와 보관 장소를 입력합니다.
- 간단 설명은 목록에 표시하고 상세 설명은 게시물 상세 페이지에서 확인합니다.
- 분실 게시물에는 다른 사용자가 댓글을 달 수 있습니다.
- 게시물 수정·삭제는 등록할 때 설정한 닉네임과 비밀번호로 확인합니다.
- 다크 모드는 테마 버튼으로 전환합니다.

## 코드 구성

- `js/`: 게시판 UI, API 호출, 폼, 인증 창, 상세 페이지, 테마
- `server/`: 입력 검증, 비밀번호 처리, 로컬 및 Supabase 저장 모듈
- `server.js`: 웹 서버와 API 경로
- `supabase/schema.sql`: 게시물·댓글 테이블과 RLS 설정
- `render.yaml`: Render Blueprint 배포 설정
