# Signal Flow Map — 경남이스포츠 UHD 방송시스템

실시간 협업 가능한 방송 신호 흐름도 편집기.

## 배포 후 처음 1회 해야 하는 일

### 1. Supabase SQL Editor에서 스키마 업데이트
`supabase/schema.sql` 전체 내용 실행. 기존 테이블이 있으면 컬럼만 추가되므로 데이터 안 사라짐.

### 2. (도면 재시드) 기존 데이터 초기화
이전에 시드된 데이터가 있다면 구버전 장비가 남아있을 수 있습니다.
- 방법 A: 앱에서 **편집 → ⟲ 전체 초기화** 버튼 클릭
- 방법 B: SQL Editor에서
  ```sql
  delete from public.connections;
  delete from public.devices;
  ```
  실행하면 다음 앱 접속 시 자동 시드됨.

## 주요 기능

### 보기 모드 (기본)
- 장비 클릭 → 상류/하류/양방향 신호 흐름 추적
- 드래그로 캔버스 이동, 휠로 줌
- 실시간 동기화 (여러 사람이 동시에 봐도 자동 갱신)

### 편집 모드
- 장비 드래그 이동
- 장비 클릭 → 편집 패널 (이름/타입/크기/포트/물리이름/연결방식)
- 포트 **＋/−** 버튼으로 개별 추가·삭제, 또는 텍스트로 쉼표 구분 일괄 입력
- 출력 포트 → 입력 포트 클릭으로 케이블 연결
- **연결방식** (SDI, 12G-SDI, FIBER, HDMI, DVI, AES, DANTE, XLR, USB, GPIO, LAN 등) 포트별로 설정 가능
- 연결방식에 따라 케이블 선 스타일 (실선/점선/dash) 자동 차별화
- 라인 중앙에 연결방식 라벨 표시

### 색상
- 파란색: Video
- 빨간색: Audio
- 보라색: Combined (Video + Audio)

## 로컬 개발

```bash
npm install
cp .env.example .env.local   # Supabase 키 입력
npm run dev
```
