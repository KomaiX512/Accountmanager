// Define the ScheduleItem interface used for post scheduling
export interface ScheduleItem {
  id: string;
  postKey: string;
  scheduledTime: Date;
  status: 'pending' | 'posted' | 'failed';
  platform: string;
  username: string;
  
  // Optional properties
  caption?: string;
  imageUrl?: string;
  postData?: Record<string, any>;
  errorMessage?: string;
  lastUpdated?: Date;
} 