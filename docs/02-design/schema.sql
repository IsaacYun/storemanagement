-- =====================================================
-- 매장 근무 관리 시스템 - 데이터베이스 스키마
-- Supabase (PostgreSQL)
-- =====================================================

-- =====================================================
-- 1. 테이블 생성
-- =====================================================

-- 1.1 stores (매장)
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    hourly_wage INTEGER NOT NULL DEFAULT 10000,
    full_attendance_bonus INTEGER DEFAULT 0,
    opening_time TIME NOT NULL DEFAULT '10:00',
    closing_time TIME NOT NULL DEFAULT '22:00',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE stores IS '매장 정보';
COMMENT ON COLUMN stores.hourly_wage IS '시급 (원)';
COMMENT ON COLUMN stores.full_attendance_bonus IS '만근 보너스 (원)';

-- 1.2 workers (근무자)
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    is_tax_applied BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    role VARCHAR(20) DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE workers IS '근무자 정보';
COMMENT ON COLUMN workers.is_tax_applied IS '3.3% 사업소득세 적용 여부';
COMMENT ON COLUMN workers.role IS 'admin: 관리자, worker: 일반 근무자';

CREATE INDEX idx_workers_store_id ON workers(store_id);
CREATE INDEX idx_workers_user_id ON workers(user_id);

-- 1.3 schedules (기본 스케줄 - 주간 반복 패턴)
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(worker_id, day_of_week)
);

COMMENT ON TABLE schedules IS '주간 기본 스케줄 (고정 패턴)';
COMMENT ON COLUMN schedules.day_of_week IS '0: 일요일, 1: 월요일, ..., 6: 토요일';

CREATE INDEX idx_schedules_worker_id ON schedules(worker_id);
CREATE INDEX idx_schedules_store_id ON schedules(store_id);

-- 1.4 변동사항 유형 ENUM
CREATE TYPE change_type AS ENUM (
    'absence',           -- 미근무 (근무불가)
    'overtime',          -- 추가근무 (연장, 조기출근)
    'substitute',        -- 대타근무
    'late',              -- 지각
    'early_leave',       -- 조퇴
    'meal_allowance',    -- 식대
    'weekly_holiday_pay' -- 주휴수당
);

-- 1.5 schedule_changes (변동사항)
CREATE TABLE schedule_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    change_type change_type NOT NULL,
    work_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    original_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    start_time TIME,
    end_time TIME,
    minutes INTEGER,
    amount INTEGER DEFAULT 0,
    note TEXT,
    created_by UUID REFERENCES workers(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES workers(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE schedule_changes IS '근무 변동사항';
COMMENT ON COLUMN schedule_changes.work_store_id IS '실제 근무한 매장 (대타 시 타매장 가능)';
COMMENT ON COLUMN schedule_changes.original_worker_id IS '대타의 경우 원래 근무 예정자';
COMMENT ON COLUMN schedule_changes.minutes IS '변동 시간 (분 단위)';
COMMENT ON COLUMN schedule_changes.amount IS '금액 (식대, 주휴수당 등)';

CREATE INDEX idx_schedule_changes_worker_id ON schedule_changes(worker_id);
CREATE INDEX idx_schedule_changes_work_date ON schedule_changes(work_date);
CREATE INDEX idx_schedule_changes_work_store_id ON schedule_changes(work_store_id);
CREATE INDEX idx_schedule_changes_year_month ON schedule_changes(EXTRACT(YEAR FROM work_date), EXTRACT(MONTH FROM work_date));

-- 1.6 monthly_settlements (월별 정산)
CREATE TABLE monthly_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

    base_work_minutes INTEGER DEFAULT 0,
    absence_minutes INTEGER DEFAULT 0,
    overtime_minutes INTEGER DEFAULT 0,
    substitute_minutes INTEGER DEFAULT 0,
    late_minutes INTEGER DEFAULT 0,
    early_leave_minutes INTEGER DEFAULT 0,

    meal_allowance INTEGER DEFAULT 0,
    weekly_holiday_pay INTEGER DEFAULT 0,
    full_attendance_bonus INTEGER DEFAULT 0,

    gross_wage INTEGER DEFAULT 0,
    tax_amount INTEGER DEFAULT 0,
    net_wage INTEGER DEFAULT 0,

    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'paid')),
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES workers(id) ON DELETE SET NULL,

    kakao_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(worker_id, year, month)
);

COMMENT ON TABLE monthly_settlements IS '월별 급여 정산';

CREATE INDEX idx_monthly_settlements_worker_id ON monthly_settlements(worker_id);
CREATE INDEX idx_monthly_settlements_year_month ON monthly_settlements(year, month);

-- 1.7 activity_logs (활동 로그)
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    target_table VARCHAR(50),
    target_id UUID,
    before_data JSONB,
    after_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE activity_logs IS '관리자 활동 로그';

CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- =====================================================
-- 2. 트리거: updated_at 자동 갱신
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stores_updated_at
    BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workers_updated_at
    BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedule_changes_updated_at
    BEFORE UPDATE ON schedule_changes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monthly_settlements_updated_at
    BEFORE UPDATE ON monthly_settlements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. RLS (Row Level Security) 정책
-- =====================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- 헬퍼 함수
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM workers
        WHERE user_id = auth.uid()
          AND role = 'admin'
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_worker_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT id FROM workers
        WHERE user_id = auth.uid()
          AND is_active = true
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- stores 정책
CREATE POLICY "stores_select" ON stores FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "stores_insert" ON stores FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "stores_update" ON stores FOR UPDATE USING (is_admin());
CREATE POLICY "stores_delete" ON stores FOR DELETE USING (is_admin());

-- workers 정책
CREATE POLICY "workers_select" ON workers FOR SELECT USING (is_admin() OR user_id = auth.uid());
CREATE POLICY "workers_insert" ON workers FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "workers_update" ON workers FOR UPDATE USING (is_admin());
CREATE POLICY "workers_delete" ON workers FOR DELETE USING (is_admin());

-- schedules 정책
CREATE POLICY "schedules_select" ON schedules FOR SELECT USING (is_admin() OR worker_id = get_current_worker_id());
CREATE POLICY "schedules_insert" ON schedules FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "schedules_update" ON schedules FOR UPDATE USING (is_admin());
CREATE POLICY "schedules_delete" ON schedules FOR DELETE USING (is_admin());

-- schedule_changes 정책
CREATE POLICY "schedule_changes_select" ON schedule_changes FOR SELECT
    USING (is_admin() OR worker_id = get_current_worker_id() OR original_worker_id = get_current_worker_id());
CREATE POLICY "schedule_changes_insert" ON schedule_changes FOR INSERT
    WITH CHECK (is_admin() OR (worker_id = get_current_worker_id() AND change_type NOT IN ('weekly_holiday_pay')));
CREATE POLICY "schedule_changes_update" ON schedule_changes FOR UPDATE
    USING (is_admin() OR (created_by = get_current_worker_id() AND status = 'pending'));
CREATE POLICY "schedule_changes_delete" ON schedule_changes FOR DELETE
    USING (is_admin() OR (created_by = get_current_worker_id() AND status = 'pending'));

-- monthly_settlements 정책
CREATE POLICY "monthly_settlements_select" ON monthly_settlements FOR SELECT
    USING (is_admin() OR worker_id = get_current_worker_id());
CREATE POLICY "monthly_settlements_insert" ON monthly_settlements FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "monthly_settlements_update" ON monthly_settlements FOR UPDATE USING (is_admin());
CREATE POLICY "monthly_settlements_delete" ON monthly_settlements FOR DELETE USING (is_admin());

-- activity_logs 정책
CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT USING (is_admin());
CREATE POLICY "activity_logs_insert" ON activity_logs FOR INSERT WITH CHECK (true);

-- =====================================================
-- 4. 초기 데이터 (예시)
-- =====================================================

-- 매장 예시 데이터
INSERT INTO stores (name, hourly_wage, full_attendance_bonus, opening_time, closing_time)
VALUES
    ('금곡', 10000, 50000, '10:00', '22:00'),
    ('두정동', 10500, 30000, '09:00', '21:00'),
    ('신부', 10000, 40000, '10:00', '22:00');
