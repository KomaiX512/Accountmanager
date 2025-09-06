// Lightweight fallback hook for unified scheduling in development
// Prevents module resolution errors during optimization and local testing

export type ScheduleJob = {
  id?: string;
  platform?: 'instagram' | 'twitter' | 'facebook' | string;
  time?: string | number | Date;
  payload?: any;
};

export interface UnifiedSchedulerAPI {
  isReady: boolean;
  schedule: (job: ScheduleJob) => Promise<{ success: boolean; id?: string; error?: string }>;
  cancel: (id: string) => Promise<{ success: boolean; error?: string }>;
  list: () => Promise<ScheduleJob[]>;
}

export default function useUnifiedScheduler(): UnifiedSchedulerAPI {
  const schedule = async (job: ScheduleJob) => {
    try {
      // No-op in dev fallback
      return { success: true, id: job.id || `dev-${Date.now()}` };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Unknown error' };
    }
  };

  const cancel = async (id: string) => {
    try {
      // No-op in dev fallback
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Unknown error' };
    }
  };

  const list = async () => {
    return [];
  };

  return {
    isReady: true,
    schedule,
    cancel,
    list,
  };
}
