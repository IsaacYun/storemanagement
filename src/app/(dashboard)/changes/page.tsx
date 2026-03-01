'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { useMonthSelection } from '@/lib/stores/useMonthSelection';
import { ScheduleChange, Worker, CHANGE_TYPE_LABELS } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Plus, ChevronLeft, ChevronRight, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/utils/activityLog';
import { formatMinutesToHoursAndMinutes } from '@/lib/calculations/workHours';

interface ChangeWithWorker extends ScheduleChange {
  worker: Worker;
}

export default function ChangesPage() {
  const router = useRouter();
  const { selectedStoreId } = useStoreSelection();
  const { year, month, goToPrevMonth, goToNextMonth } = useMonthSelection();
  const [changes, setChanges] = useState<ChangeWithWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMonthConfirmed, setIsMonthConfirmed] = useState(false);

  const fetchChanges = async () => {
    if (!selectedStoreId) return;

    setIsLoading(true);
    const supabase = createClient();

    const currentDate = new Date(year, month - 1);
    const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');

    // 1. 해당 매장 근무자 ID 조회
    const { data: storeWorkers } = await supabase
      .from('workers')
      .select('id')
      .eq('store_id', selectedStoreId);

    const workerIds = storeWorkers?.map((w) => w.id) || [];

    // 2. 해당 근무자들의 변동사항 조회 또는 해당 매장에서 근무한 변동사항 조회
    // workerIds가 비어있으면 work_store_id만으로 조회
    const orFilter = workerIds.length > 0
      ? `worker_id.in.(${workerIds.join(',')}),work_store_id.eq.${selectedStoreId}`
      : `work_store_id.eq.${selectedStoreId}`;

    const [changesRes, settlementRes] = await Promise.all([
      supabase
        .from('schedule_changes')
        .select('*, worker:workers(*)')
        .or(orFilter)
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd)
        .order('work_date', { ascending: false }),
      supabase
        .from('monthly_settlements')
        .select('status')
        .eq('store_id', selectedStoreId)
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'confirmed')
        .limit(1),
    ]);

    // 중복 제거 (같은 변동사항이 두 조건에 모두 해당할 수 있음)
    const uniqueChanges = changesRes.data?.reduce((acc, change) => {
      if (!acc.find((c: ChangeWithWorker) => c.id === change.id)) {
        acc.push(change);
      }
      return acc;
    }, [] as ChangeWithWorker[]) || [];

    setChanges(uniqueChanges);
    setIsMonthConfirmed((settlementRes.data?.length || 0) > 0);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchChanges();
  }, [selectedStoreId, year, month]);

  const handleDelete = async (changeId: string) => {
    const supabase = createClient();

    try {
      const changeToDelete = changes.find((c) => c.id === changeId);

      const { error } = await supabase
        .from('schedule_changes')
        .delete()
        .eq('id', changeId);

      if (error) throw error;

      toast.success('변동사항이 삭제되었습니다');

      // 활동 로그 저장 (이름 포함)
      logActivity({
        action: 'delete',
        targetTable: 'schedule_changes',
        targetId: changeId,
        beforeData: {
          ...changeToDelete,
          worker_name: changeToDelete?.worker?.name,
        } as unknown as Record<string, unknown>,
      });

      fetchChanges();
    } catch (error) {
      toast.error('삭제에 실패했습니다');
      console.error(error);
    }
  };

  const getChangeColor = (type: ScheduleChange['change_type']) => {
    switch (type) {
      case 'absence':
        return 'destructive';
      case 'substitute':
        return 'secondary';
      case 'overtime':
        return 'default';
      default:
        return 'outline';
    }
  };

  if (!selectedStoreId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          매장을 선택해주세요
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold min-w-[140px] text-center">
            {year}년 {month}월
          </h1>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {isMonthConfirmed && (
            <Badge variant="secondary" className="ml-2">
              <Lock className="h-3 w-3 mr-1" />
              정산완료
            </Badge>
          )}
        </div>
        <Button
          onClick={() => router.push(`/changes/new?year=${year}&month=${month}`)}
          disabled={isMonthConfirmed}
        >
          <Plus className="h-4 w-4 mr-2" />
          변동사항 입력
        </Button>
      </div>

      {isMonthConfirmed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
          이 달은 정산이 완료되어 변동사항을 수정하거나 삭제할 수 없습니다.
          수정이 필요하면 정산 페이지에서 정산을 취소해주세요.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            변동사항 목록 ({changes.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : changes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {year}년 {month}월 변동사항이 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>근무자</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>시간/금액</TableHead>
                    <TableHead>메모</TableHead>
                    <TableHead>상태</TableHead>
                    {!isMonthConfirmed && <TableHead className="text-center">삭제</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.map((change) => (
                    <TableRow key={change.id}>
                      <TableCell>
                        {format(new Date(change.work_date), 'M/d (EEE)', { locale: ko })}
                      </TableCell>
                      <TableCell>{change.worker?.name}</TableCell>
                      <TableCell>
                        <Badge variant={getChangeColor(change.change_type)}>
                          {CHANGE_TYPE_LABELS[change.change_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {change.start_time && change.end_time
                          ? `${change.start_time.slice(0, 5)} - ${change.end_time.slice(0, 5)}`
                          : change.minutes
                          ? formatMinutesToHoursAndMinutes(change.minutes)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-gray-500 max-w-[200px] truncate">
                        {change.note || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            change.status === 'approved'
                              ? 'default'
                              : change.status === 'pending'
                              ? 'outline'
                              : 'destructive'
                          }
                        >
                          {change.status === 'approved'
                            ? '승인'
                            : change.status === 'pending'
                            ? '대기'
                            : '거절'}
                        </Badge>
                      </TableCell>
                      {!isMonthConfirmed && (
                        <TableCell className="text-center">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>변동사항을 삭제하시겠습니까?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {change.worker?.name}의 {format(new Date(change.work_date), 'M월 d일', { locale: ko })} {CHANGE_TYPE_LABELS[change.change_type]} 기록이 삭제됩니다.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(change.id)}
                                  className="bg-red-500 hover:bg-red-600"
                                >
                                  삭제
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
