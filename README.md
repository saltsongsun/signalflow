# Signal Flow Map

UHD 방송 시스템 신호 흐름 맵. 비디오/오디오 신호 경로를 시각화하고 실시간으로 협업 편집.

**스택**: Next.js 14 + Tailwind + Supabase (Realtime + Postgres) + Vercel

## 주요 기능

- 비디오(파랑) / 오디오(빨강) / 합쳐진 신호(보라) 색상 구분
- 출력 포트 → 입력 포트 클릭으로 연결 생성
- 연결선 클릭으로 삭제
- 출력 장비 클릭 시 해당 신호의 전체 경로 하이라이트 + 흐름 애니메이션
- 장비별 입출력 수, 물리 포트명, 라우팅 이름 개별 설정
- 실시간 협업 (Supabase Realtime, 여러 사용자 동시 편집)
- JSON 저장/불러오기 (백업용)

---

## 배포 가이드

### 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 가입 → **New project** 생성
2. 왼쪽 메뉴에서 **SQL Editor** → **New query**
3. `supabase/schema.sql` 내용 전체 복사 → 붙여넣기 → **Run**
4. 왼쪽 **Project Settings** → **API** → 다음 두 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. GitHub 업로드

```bash
cd signal-flow-map
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/signal-flow-map.git
git push -u origin main
```

### 3. Vercel 배포

1. [vercel.com](https://vercel.com) 로그인 → **Add New → Project**
2. GitHub에서 `signal-flow-map` 레포 선택 → **Import**
3. **Environment Variables** 섹션에서 2개 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = (Supabase에서 복사한 URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (Supabase에서 복사한 anon key)
4. **Deploy** 클릭 → 끝

---

## 로컬 개발

```bash
npm install
cp .env.example .env.local
# .env.local 에 Supabase 값 입력
npm run dev
```

http://localhost:3000 접속

## 사용법

- **장비 드래그**: 위치 이동
- **배경 드래그**: 화면 팬
- **휠**: 확대/축소
- **출력 포트(●)** → **입력 포트(○)** 클릭: 연결 생성
- **연결선 클릭**: 삭제
- **장비 ⚙ 아이콘**: 입출력, 물리 포트, 라우팅 편집
- **출력 장비 클릭**: 해당 신호의 역추적 경로 전체 하이라이트

## 데이터 초기화

최초 접속 시 방송시스템 샘플 데이터(CAM, MIC, Router, Switcher, Embedder, LED 등)가 자동 시드됩니다.
모두 지우고 새로 시작하려면 Supabase SQL Editor에서:

```sql
delete from public.connections;
delete from public.devices;
```

실행 후 브라우저 새로고침.
