-- =====================================================
-- Migration 005: 매장 시급 변경 이력 테이블 추가
-- =====================================================
-- 목적: 시급 변경 시 특정 날짜부터 적용되도록 함
-- (이전 날짜의 급여 계산에 영향 없음)
-- =====================================================

-- 1. store_wage_history 테이블 생성
CREATE TABLE IF NOT EXISTS store_wage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    hourly_wage INTEGER NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- 같은 매장에서 같은 시작일에 여러 시급이 있을 수 없음
    UNIQUE(store_id, effective_from)
);

COMMENT ON TABLE store_wage_history IS '매장 시급 변경 이력';
COMMENT ON COLUMN store_wage_history.hourly_wage IS '시급 (원)';
COMMENT ON COLUMN store_wage_history.effective_from IS '적용 시작일';
COMMENT ON COLUMN store_wage_history.effective_to IS '적용 종료일 (NULL이면 현재까지 유효)';

-- 2. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_store_wage_history_store_id ON store_wage_history(store_id);
CREATE INDEX IF NOT EXISTS idx_store_wage_history_effective_from ON store_wage_history(effective_from);

-- 3. RLS 정책 설정
ALTER TABLE store_wage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_wage_history_select" ON store_wage_history
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "store_wage_history_insert" ON store_wage_history
    FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "store_wage_history_update" ON store_wage_history
    FOR UPDATE USING (is_admin());
CREATE POLICY "store_wage_history_delete" ON store_wage_history
    FOR DELETE USING (is_admin());

-- 4. 기존 매장의 현재 시급을 이력 테이블로 마이그레이션
-- (effective_from을 아주 과거 날짜로 설정하여 항상 적용되도록)
INSERT INTO store_wage_history (store_id, hourly_wage, effective_from)
SELECT id, hourly_wage, '2020-01-01'::DATE
FROM stores
WHERE NOT EXISTS (
    SELECT 1 FROM store_wage_history WHERE store_id = stores.id
);
