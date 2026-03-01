-- =====================================================
-- Migration 004: workers 테이블에 퇴사일 추가
-- =====================================================

-- 1. resigned_at 컬럼 추가
ALTER TABLE workers
ADD COLUMN IF NOT EXISTS resigned_at DATE DEFAULT NULL;

COMMENT ON COLUMN workers.resigned_at IS '퇴사일 (NULL이면 재직 중)';

-- 2. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_workers_resigned_at ON workers(resigned_at);
