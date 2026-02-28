'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { Worker, Store, Schedule, DAY_LABELS } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface WorkerWithSchedules extends Worker {
  schedules: Schedule[];
}

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export default function WorkersPage() {
  const { selectedStoreId } = useStoreSelection();
  const [workers, setWorkers] = useState<WorkerWithSchedules[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editWorker, setEditWorker] = useState<WorkerWithSchedules | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

  // 폼 상태
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState('');
  const [isTaxApplied, setIsTaxApplied] = useState(false);
  const [role, setRole] = useState<'admin' | 'worker'>('worker');

  // 스케줄 폼 상태
  const [scheduleInputs, setScheduleInputs] = useState<ScheduleInput[]>(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      startTime: '',
      endTime: '',
      isActive: false,
    }))
  );

  const fetchWorkers = async () => {
    if (!selectedStoreId) return;

    setIsLoading(true);
    const supabase = createClient();

    const { data: workersData } = await supabase
      .from('workers')
      .select('*')
      .eq('store_id', selectedStoreId)
      .order('name');

    const workerIds = workersData?.map((w) => w.id) || [];

    const { data: schedulesData } = await supabase
      .from('schedules')
      .select('*')
      .in('worker_id', workerIds);

    const workersWithSchedules: WorkerWithSchedules[] = (workersData || []).map(
      (worker) => ({
        ...worker,
        schedules: (schedulesData || []).filter((s) => s.worker_id === worker.id),
      })
    );

    setWorkers(workersWithSchedules);
    setIsLoading(false);
  };

  const fetchStores = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('name');

    setStores(data || []);
  };

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [selectedStoreId]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setStoreId(selectedStoreId || '');
    setIsTaxApplied(false);
    setRole('worker');
    setEditWorker(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (worker: WorkerWithSchedules) => {
    setEditWorker(worker);
    setName(worker.name);
    setPhone(worker.phone || '');
    setStoreId(worker.store_id);
    setIsTaxApplied(worker.is_tax_applied);
    setRole(worker.role);
    setIsDialogOpen(true);
  };

  const openScheduleDialog = (worker: WorkerWithSchedules) => {
    setEditWorker(worker);
    const inputs = Array.from({ length: 7 }, (_, i) => {
      const schedule = worker.schedules.find((s) => s.day_of_week === i);
      return {
        dayOfWeek: i,
        startTime: schedule?.start_time?.slice(0, 5) || '',
        endTime: schedule?.end_time?.slice(0, 5) || '',
        isActive: !!schedule?.is_active,
      };
    });
    setScheduleInputs(inputs);
    setIsScheduleDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !storeId) {
      toast.error('필수 항목을 입력해주세요');
      return;
    }

    const supabase = createClient();
    const workerData = {
      name,
      phone: phone || null,
      store_id: storeId,
      is_tax_applied: isTaxApplied,
      role,
    };

    try {
      if (editWorker) {
        const { error } = await supabase
          .from('workers')
          .update(workerData)
          .eq('id', editWorker.id);

        if (error) throw error;
        toast.success('근무자가 수정되었습니다');
      } else {
        const { error } = await supabase.from('workers').insert(workerData);

        if (error) throw error;
        toast.success('근무자가 등록되었습니다');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchWorkers();
    } catch (error) {
      toast.error('저장에 실패했습니다');
      console.error(error);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editWorker) return;

    const supabase = createClient();

    try {
      // 기존 스케줄 삭제
      await supabase
        .from('schedules')
        .delete()
        .eq('worker_id', editWorker.id);

      // 새 스케줄 추가
      const schedulesToInsert = scheduleInputs
        .filter((s) => s.isActive && s.startTime && s.endTime)
        .map((s) => ({
          worker_id: editWorker.id,
          store_id: editWorker.store_id,
          day_of_week: s.dayOfWeek,
          start_time: s.startTime,
          end_time: s.endTime,
          is_active: true,
        }));

      if (schedulesToInsert.length > 0) {
        const { error } = await supabase
          .from('schedules')
          .insert(schedulesToInsert);

        if (error) throw error;
      }

      toast.success('스케줄이 저장되었습니다');
      setIsScheduleDialogOpen(false);
      fetchWorkers();
    } catch (error) {
      toast.error('저장에 실패했습니다');
      console.error(error);
    }
  };

  const updateScheduleInput = (
    dayOfWeek: number,
    field: keyof ScheduleInput,
    value: string | boolean
  ) => {
    setScheduleInputs((prev) =>
      prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s))
    );
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">근무자 관리</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              근무자 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editWorker ? '근무자 수정' : '새 근무자 등록'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>이름 *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-2">
                <Label>연락처</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                />
              </div>
              <div className="space-y-2">
                <Label>소속 매장 *</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="매장 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>역할</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as 'admin' | 'worker')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">근무자</SelectItem>
                    <SelectItem value="admin">관리자</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>3.3% 세금 적용</Label>
                <Switch
                  checked={isTaxApplied}
                  onCheckedChange={setIsTaxApplied}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" className="flex-1">
                  {editWorker ? '수정' : '등록'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 스케줄 다이얼로그 */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editWorker?.name} 스케줄 설정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleScheduleSubmit} className="space-y-3">
            {scheduleInputs.map((schedule) => (
              <div
                key={schedule.dayOfWeek}
                className="flex items-center gap-2"
              >
                <Switch
                  checked={schedule.isActive}
                  onCheckedChange={(v) =>
                    updateScheduleInput(schedule.dayOfWeek, 'isActive', v)
                  }
                />
                <span className="w-8 text-sm font-medium">
                  {DAY_LABELS[schedule.dayOfWeek]}
                </span>
                <Input
                  type="time"
                  value={schedule.startTime}
                  onChange={(e) =>
                    updateScheduleInput(
                      schedule.dayOfWeek,
                      'startTime',
                      e.target.value
                    )
                  }
                  disabled={!schedule.isActive}
                  className="flex-1"
                />
                <span>~</span>
                <Input
                  type="time"
                  value={schedule.endTime}
                  onChange={(e) =>
                    updateScheduleInput(
                      schedule.dayOfWeek,
                      'endTime',
                      e.target.value
                    )
                  }
                  disabled={!schedule.isActive}
                  className="flex-1"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsScheduleDialogOpen(false)}
              >
                취소
              </Button>
              <Button type="submit" className="flex-1">
                저장
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">근무자 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : workers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              등록된 근무자가 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>스케줄</TableHead>
                  <TableHead className="text-center">세금</TableHead>
                  <TableHead className="text-center">역할</TableHead>
                  <TableHead className="text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.id}>
                    <TableCell className="font-medium">{worker.name}</TableCell>
                    <TableCell>{worker.phone || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {worker.schedules
                          .filter((s) => s.is_active)
                          .sort((a, b) => a.day_of_week - b.day_of_week)
                          .map((s) => (
                            <Badge key={s.id} variant="outline" className="text-xs">
                              {DAY_LABELS[s.day_of_week]}{' '}
                              {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                            </Badge>
                          ))}
                        {worker.schedules.length === 0 && (
                          <span className="text-gray-400 text-sm">미설정</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {worker.is_tax_applied ? (
                        <Badge variant="secondary">3.3%</Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={worker.role === 'admin' ? 'default' : 'outline'}
                      >
                        {worker.role === 'admin' ? '관리자' : '근무자'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openScheduleDialog(worker)}
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(worker)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
