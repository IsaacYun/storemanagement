# 매장 근무 관리 시스템

다중 매장의 근무자 스케줄 관리, 변동사항 입력, 월말 급여 정산을 자동화하는 웹 시스템입니다.

## 주요 기능

### 스케줄 관리
- **달력 뷰**: 월간 달력에서 일자별 근무자 현황 확인
- **고정 스케줄**: 매장별 근무자의 주간 고정 스케줄 설정
- **스케줄 유효기간**: effective_from/effective_to로 스케줄 변경 이력 관리
- **자정 넘김 처리**: 18:00-00:00 등 자정을 넘기는 근무시간 정확히 계산

### 변동사항 관리
- **미근무**: 결근, 휴가 등 미근무 처리
- **추가근무**: 정규 스케줄 외 추가 근무
- **대타근무**: 타 근무자 대신 근무 (타매장 대타 포함)
- **지각/조퇴**: 지각 및 조퇴 시간 기록
- **식대**: 복지 형태의 식대 지급 (시간 단위)
- **주휴수당**: 주휴수당 시간 입력

### 급여 정산
- **자동 계산**: 근무시간 기반 급여 자동 계산
- **0.5시간 단위 올림**: 추가근무+대타 합산에 0.5시간 단위 올림 적용
- **세금 처리**: 3.3% 사업소득세 적용 (근무자별 설정)
- **만근 보너스**: 매장별 만근 보너스 설정
- **정산 확정**: 월별 정산 확정 시 해당 월 수정 잠금
- **카카오톡 복사**: 급여 안내 메시지 클립보드 복사

### 관리 기능
- **다중 매장**: 여러 매장 통합 관리
- **매장별 시급**: 매장별 시급 및 유효기간 설정
- **근무자 관리**: 근무자 등록/수정/삭제
- **프로필 설정**: 본인 이름 및 비밀번호 변경
- **활동 로그**: 관리자 행동 기록

## 기술 스택

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **Backend/DB**: Supabase (PostgreSQL, Auth, RLS)
- **State**: Zustand
- **Date**: date-fns

## 시작하기

### 필수 요구사항

- Node.js 18+
- npm 또는 yarn
- Supabase 프로젝트

### 환경 변수 설정

`.env.local` 파일을 생성하고 다음 변수를 설정하세요:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

### 데이터베이스 설정

Supabase SQL Editor에서 `src/lib/supabase/schema.sql` 파일의 내용을 실행하여 테이블과 RLS 정책을 생성합니다.

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/login/          # 로그인 페이지
│   └── (dashboard)/
│       ├── schedule/calendar/ # 달력 뷰
│       ├── changes/           # 변동사항 관리
│       ├── settlement/        # 월별 정산
│       ├── settings/          # 프로필 설정
│       └── admin/             # 관리 페이지
├── components/
│   ├── layout/                # 레이아웃 컴포넌트
│   └── ui/                    # shadcn/ui 컴포넌트
└── lib/
    ├── calculations/          # 근무시간/급여 계산
    ├── format/                # 카카오톡 메시지 포맷
    ├── stores/                # Zustand 스토어
    ├── supabase/              # Supabase 클라이언트
    └── utils/                 # 유틸리티 함수
```

## Vercel 배포

### 1. GitHub 저장소 연결

1. [Vercel](https://vercel.com)에 로그인
2. "Add New" > "Project" 클릭
3. GitHub 저장소 선택 및 Import

### 2. 환경 변수 설정

Vercel 프로젝트 설정에서 다음 환경 변수 추가:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. 배포

"Deploy" 버튼 클릭으로 자동 배포됩니다.
이후 main 브랜치에 push할 때마다 자동으로 재배포됩니다.

## 라이선스

MIT License
