import { createClient } from '@/lib/supabase/client';

type ActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'confirm_settlement'
  | 'cancel_settlement';

type TargetTable =
  | 'stores'
  | 'workers'
  | 'schedules'
  | 'schedule_changes'
  | 'monthly_settlements';

interface LogActivityParams {
  action: ActionType;
  targetTable?: TargetTable;
  targetId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
}

export async function logActivity({
  action,
  targetTable,
  targetId,
  beforeData,
  afterData,
}: LogActivityParams) {
  try {
    const supabase = createClient();

    // 현재 로그인한 사용자 정보 가져오기
    const { data: { user } } = await supabase.auth.getUser();

    // 현재 worker_id 가져오기
    let workerId: string | null = null;
    if (user) {
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', user.id)
        .single();
      workerId = worker?.id || null;
    }

    await supabase.from('activity_logs').insert({
      user_id: user?.id || null,
      worker_id: workerId,
      action,
      target_table: targetTable || null,
      target_id: targetId || null,
      before_data: beforeData || null,
      after_data: afterData || null,
    });
  } catch (error) {
    // 로그 저장 실패해도 메인 작업에 영향 없게 함
    console.error('Failed to log activity:', error);
  }
}
