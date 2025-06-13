export interface User {
  id: string;
  email: string;
  displayName: string;
  userType: 'free' | 'premium' | 'admin';
  subscription?: Subscription;
  createdAt: string;
  lastLogin: string;
  trialEndsAt?: string;
  isTrialActive?: boolean;
}

export interface Subscription {
  planId: 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  startDate: string;
  endDate?: string;
  limits: SubscriptionLimits;
  trialDaysRemaining?: number;
}

export interface SubscriptionLimits {
  posts: number;
  discussions: number;
  aiReplies: number | 'unlimited';
  goalModelDays: number | 'unlimited';
  campaigns: number;
  autoSchedule: boolean;
  autoReply: boolean;
}

export interface PricingPlan {
  id: 'basic' | 'premium' | 'enterprise';
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  limits: SubscriptionLimits;
  trialDays?: number;
  popular?: boolean;
  contactUs?: boolean;
}

export interface UsageStats {
  userId: string;
  period: string; // YYYY-MM format
  postsUsed: number;
  discussionsUsed: number;
  aiRepliesUsed: number;
  campaignsUsed: number;
  lastUpdated: string;
}

export interface AccessControlResult {
  allowed: boolean;
  reason?: string;
  limitReached?: boolean;
  upgradeRequired?: boolean;
  redirectToPricing?: boolean;
} 