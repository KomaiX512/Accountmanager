import { User, UsageStats, AccessControlResult, PricingPlan } from '../types/user';

class UserService {
  private readonly API_BASE_URL = process.env.NODE_ENV === 'production' 
    ? 'https://sentientm.com/api' 
    : '/api';

  // Cache for user data to reduce API calls
  private userCache = new Map<string, { data: User; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Pricing plans configuration
  public readonly PRICING_PLANS: PricingPlan[] = [
    {
      id: 'basic',
      name: 'Basic',
      price: 'Free',
      period: '3-day trial',
      description: 'Perfect for getting started',
      features: [
        '5 Instant Posts',
        '10 AI Discussions',
        '2 Days AI Reply Access',
        'Goal Model (2 days)',
        'Basic Analytics'
      ],
      limits: {
        posts: 5,
        discussions: 10,
        aiReplies: 5,
        goalModelDays: 2,
        campaigns: 1,
        autoSchedule: false,
        autoReply: false
      },
      trialDays: 3
    },
    {
      id: 'premium',
      name: 'Premium',
      price: '$29',
      period: '/month',
      description: 'For serious content creators',
      features: [
        '160 Instant Posts',
        '200 AI Discussions',
        'Unlimited AI Replies',
        '10 Goal Model Campaigns',
        'Auto Schedule Posts',
        'Auto Reply with AI',
        'Advanced Analytics',
        'Premium Support'
      ],
      limits: {
        posts: 160,
        discussions: 200,
        aiReplies: 'unlimited',
        goalModelDays: 'unlimited',
        campaigns: 10,
        autoSchedule: true,
        autoReply: true
      },
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      period: 'Contact us',
      description: 'For large organizations',
      features: [
        'Unlimited Everything',
        'Custom Integrations',
        'Dedicated Support',
        'Custom Analytics',
        'White-label Options',
        'Priority Processing',
        'Custom AI Models',
        'SLA Guarantee'
      ],
      limits: {
        posts: 999999,
        discussions: 999999,
        aiReplies: 'unlimited',
        goalModelDays: 'unlimited',
        campaigns: 999999,
        autoSchedule: true,
        autoReply: true
      },
      contactUs: true
    }
  ];


  // Get user data from R2 with caching
  async getUserData(userId: string): Promise<User | null> {
    try {
      // Check cache first
      const cached = this.userCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('[UserService] Returning cached user data for', userId);
        return cached.data;
      }

      console.log('[UserService] Fetching user data from API for', userId);
      const response = await fetch(`${this.API_BASE_URL}/user/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // User doesn't exist, create default free user
          return await this.createDefaultUser(userId);
        }
        throw new Error(`Failed to fetch user data: ${response.statusText}`);
      }

      const userData = await response.json();
      
      // Cache the user data
      this.userCache.set(userId, {
        data: userData,
        timestamp: Date.now()
      });

      return userData;
    } catch (error) {
      console.error('[UserService] Error getting user data:', error);
      // Fallback to creating a default user
      return await this.createDefaultUser(userId);
    }
  }

  // Create default user in R2
  private async createDefaultUser(userId: string): Promise<User> {
    const defaultUser: User = {
      id: userId,
      email: '',
      displayName: '',
      userType: 'freemium',
      subscription: {
        planId: 'basic',
        status: 'trial',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
        limits: this.PRICING_PLANS[0].limits,
        trialDaysRemaining: 3
      },
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      isTrialActive: true
    };

    try {
      await this.saveUserData(defaultUser);
      return defaultUser;
    } catch (error) {
      console.error('[UserService] Error creating default user:', error);
      return defaultUser; // Return anyway for app functionality
    }
  }

  // Save user data to R2 and update cache
  async saveUserData(userData: User): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/user/${userData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save user data: ${response.statusText}`);
      }

      // Update cache
      this.userCache.set(userData.id, {
        data: userData,
        timestamp: Date.now()
      });

      console.log('[UserService] User data saved and cached for', userData.id);
    } catch (error) {
      console.error('[UserService] Error saving user data:', error);
      throw error;
    }
  }

  // Get usage stats for current period
  async getUsageStats(userId: string): Promise<UsageStats> {
    const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    try {
      const response = await fetch(`${this.API_BASE_URL}/user/${userId}/usage/${currentPeriod}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No usage stats yet, return default
          return {
            userId,
            period: currentPeriod,
            postsUsed: 0,
            discussionsUsed: 0,
            aiRepliesUsed: 0,
            campaignsUsed: 0,
            lastUpdated: new Date().toISOString()
          };
        }
        throw new Error(`Failed to fetch usage stats: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[UserService] Error getting usage stats:', error);
      // Return default stats
      return {
        userId,
        period: currentPeriod,
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Update usage stats
  async updateUsageStats(userId: string, statsUpdate: Partial<Omit<UsageStats, 'userId' | 'period'>>): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/user/${userId}/usage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statsUpdate),
      });

      if (!response.ok) {
        throw new Error(`Failed to update usage stats: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[UserService] Error updating usage stats:', error);
      // Don't throw - usage tracking is not critical for app functionality
    }
  }

  // Check if user can access a feature
  async checkAccess(userId: string, feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'autoSchedule' | 'autoReply' | 'goalModel'): Promise<AccessControlResult> {
    try {
      const [userData, usageStats] = await Promise.all([
        this.getUserData(userId),
        this.getUsageStats(userId)
      ]);

      if (!userData) {
        return { allowed: false, reason: 'User not found', upgradeRequired: true };
      }

      // Admin users have unlimited access
      if (userData.userType === 'admin') {
        return { allowed: true };
      }

      const subscription = userData.subscription;
      if (!subscription) {
        return { allowed: false, reason: 'No active subscription', upgradeRequired: true };
      }

      // Check if trial is expired
      if (subscription.status === 'trial' && userData.trialEndsAt) {
        const trialEnd = new Date(userData.trialEndsAt);
        if (new Date() > trialEnd) {
          return { 
            allowed: false, 
            reason: 'Trial expired', 
            upgradeRequired: true,
            redirectToPricing: true 
          };
        }
      }

      // Check subscription status
      if (subscription.status === 'cancelled' || subscription.status === 'expired') {
        return { 
          allowed: false, 
          reason: 'Subscription inactive', 
          upgradeRequired: true,
          redirectToPricing: true 
        };
      }

      const limits = subscription.limits;

      // Check feature-specific access
      switch (feature) {
        case 'posts':
          if (typeof limits.posts === 'string' || usageStats.postsUsed < limits.posts) {
            return { allowed: true };
          }
          return { 
            allowed: false, 
            reason: `Post limit reached (${usageStats.postsUsed}/${limits.posts})`, 
            limitReached: true,
            upgradeRequired: true 
          };

        case 'discussions':
          if (typeof limits.discussions === 'string' || usageStats.discussionsUsed < limits.discussions) {
            return { allowed: true };
          }
          return { 
            allowed: false, 
            reason: `Discussion limit reached (${usageStats.discussionsUsed}/${limits.discussions})`, 
            limitReached: true,
            upgradeRequired: true 
          };

        case 'aiReplies':
          if (limits.aiReplies === 'unlimited' || usageStats.aiRepliesUsed < (limits.aiReplies as number)) {
            return { allowed: true };
          }
          return { 
            allowed: false, 
            reason: `AI Reply limit reached (${usageStats.aiRepliesUsed}/${limits.aiReplies})`, 
            limitReached: true,
            upgradeRequired: true 
          };

        case 'campaigns':
          if (typeof limits.campaigns === 'string' || usageStats.campaignsUsed < limits.campaigns) {
            return { allowed: true };
          }
          return { 
            allowed: false, 
            reason: `Campaign limit reached (${usageStats.campaignsUsed}/${limits.campaigns})`, 
            limitReached: true,
            upgradeRequired: true 
          };

        case 'autoSchedule':
          if (limits.autoSchedule) {
            return { allowed: true };
          }
          return { 
            allowed: false, 
            reason: 'Auto Schedule not available in your plan', 
            upgradeRequired: true 
          };

        case 'autoReply':
          if (limits.autoReply) {
            return { allowed: true };
          }
          return { 
            allowed: false, 
            reason: 'Auto Reply not available in your plan', 
            upgradeRequired: true 
          };

        case 'goalModel':
          // Premium users have unlimited access
          if (userData.userType === 'premium') {
            return { allowed: true };
          }
          
          // Free users - check remaining goal model days
          const goalModelDays = limits.goalModelDays;
          if (typeof goalModelDays === 'number' && goalModelDays > 0) {
            return { allowed: true };
          }
          
          return { 
            allowed: false, 
            reason: 'Goal Model is a Premium feature', 
            upgradeRequired: true 
          };

        default:
          return { allowed: false, reason: 'Unknown feature' };
      }
    } catch (error) {
      console.error('[UserService] Error checking access:', error);
      // Allow access if there's an error to prevent app breaking
      return { allowed: true };
    }
  }

  // Increment usage counter
  async incrementUsage(userId: string, feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'resets'): Promise<void> {
    try {
      // Use new backend endpoint for usage increment
      const response = await fetch(`${this.API_BASE_URL}/usage/increment/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feature }),
      });

      if (!response.ok) {
        console.warn('[UserService] Usage increment failed, but continuing operation');
      } else {
        console.log(`[UserService] Successfully incremented ${feature} usage for ${userId}`);
      }
    } catch (error) {
      console.error('[UserService] Error incrementing usage:', error);
      // Don't throw - usage tracking is not critical
    }
  }

  // Clear user cache (useful after upgrades/changes)
  clearUserCache(userId?: string): void {
    if (userId) {
      this.userCache.delete(userId);
      console.log('[UserService] Cleared cache for user', userId);
    } else {
      this.userCache.clear();
      console.log('[UserService] Cleared all user cache');
    }
  }

  // Get pricing plans from backend
  async getPricingPlans(): Promise<PricingPlan[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/pricing-plans`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pricing plans: ${response.statusText}`);
      }

      const data = await response.json();
      return data.plans;
    } catch (error) {
      console.error('[UserService] Error fetching pricing plans:', error);
      // Fallback to local plans
      return this.PRICING_PLANS;
    }
  }

  // Process payment (mock for now, will integrate with real gateway later)
  async processPayment(userId: string, planId: string, paymentMethod?: any): Promise<{ success: boolean; message: string; subscription?: any }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, planId, paymentMethod }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Payment processing failed');
      }

      // Clear cache to force refresh of user data
      this.clearUserCache(userId);

      return result;
    } catch (error) {
      console.error('[UserService] Error processing payment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Payment processing failed'
      };
    }
  }

  // Admin authentication
  async authenticateAdmin(username: string, password: string): Promise<{ success: boolean; adminToken?: string; message: string }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/admin/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          message: result.message || 'Authentication failed'
        };
      }

      return result;
    } catch (error) {
      console.error('[UserService] Error during admin authentication:', error);
      return {
        success: false,
        message: 'Authentication error occurred'
      };
    }
  }

  // Upgrade user to admin
  async upgradeToAdmin(userId: string, adminToken: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/admin/upgrade-user/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adminToken }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          message: result.message || 'Upgrade failed'
        };
      }

      // Clear cache to force refresh of user data
      this.clearUserCache(userId);

      return result;
    } catch (error) {
      console.error('[UserService] Error upgrading user to admin:', error);
      return {
        success: false,
        message: 'Upgrade error occurred'
      };
    }
  }

  // Enhanced access check using new backend
  async checkAccessNew(userId: string, feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'autoSchedule' | 'autoReply' | 'goalModel'): Promise<AccessControlResult> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/access-check/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feature }),
      });

      if (!response.ok) {
        console.warn('[UserService] Access check failed, allowing access');
        return { allowed: true };
      }

      const result = await response.json();
      console.log(`[UserService] Access check for ${feature}: ${result.allowed ? 'ALLOWED' : 'DENIED'}`);
      return result;
    } catch (error) {
      console.error('[UserService] Error checking access:', error);
      // Allow access if there's an error to prevent app breaking
      return { allowed: true };
    }
  }
}

export default new UserService(); 