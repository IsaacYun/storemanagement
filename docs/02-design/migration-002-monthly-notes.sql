-- 월별 메모 테이블 추가
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE monthly_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, year, month)
);

COMMENT ON TABLE monthly_notes IS '월별 특이사항 메모';

CREATE INDEX idx_monthly_notes_store_year_month ON monthly_notes(store_id, year, month);

-- updated_at 트리거
CREATE TRIGGER update_monthly_notes_updated_at
    BEFORE UPDATE ON monthly_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS 정책
ALTER TABLE monthly_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_notes_select" ON monthly_notes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "monthly_notes_insert" ON monthly_notes FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "monthly_notes_update" ON monthly_notes FOR UPDATE USING (is_admin());
CREATE POLICY "monthly_notes_delete" ON monthly_notes FOR DELETE USING (is_admin());
