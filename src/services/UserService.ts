import { User, UsageStats, AccessControlResult, PricingPlan } from '../types/user';

class UserService {
  private readonly API_BASE_URL = process.env.NODE_ENV === 'production' 
    ? 'https://your-domain.com/api' 
    : 'http://localhost:3002/api';

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

  // Admin credentials
  private readonly ADMIN_CREDENTIALS = {
    username: 'sentientai',
    password: 'Sentiant123@'
  };

  // Get user data from R2
  async getUserData(userId: string): Promise<User | null> {
    try {
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

      return await response.json();
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
      userType: 'free',
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

  // Save user data to R2
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

  // Authenticate admin user
  authenticateAdmin(username: string, password: string): boolean {
    return username === this.ADMIN_CREDENTIALS.username && 
           password === this.ADMIN_CREDENTIALS.password;
  }

  // Upgrade user to admin
  async upgradeToAdmin(userId: string): Promise<void> {
    try {
      const userData = await this.getUserData(userId);
      if (!userData) {
        throw new Error('User not found');
      }

      userData.userType = 'admin';
      userData.subscription = {
        planId: 'enterprise',
        status: 'active',
        startDate: new Date().toISOString(),
        limits: {
          posts: 999999,
          discussions: 999999,
          aiReplies: 'unlimited',
          goalModelDays: 'unlimited',
          campaigns: 999999,
          autoSchedule: true,
          autoReply: true
        }
      };

      await this.saveUserData(userData);
    } catch (error) {
      console.error('[UserService] Error upgrading to admin:', error);
      throw error;
    }
  }

  // Increment usage counter
  async incrementUsage(userId: string, feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns'): Promise<void> {
    try {
      const usageStats = await this.getUsageStats(userId);
      
      const update: Partial<UsageStats> = {
        lastUpdated: new Date().toISOString()
      };

      switch (feature) {
        case 'posts':
          update.postsUsed = usageStats.postsUsed + 1;
          break;
        case 'discussions':
          update.discussionsUsed = usageStats.discussionsUsed + 1;
          break;
        case 'aiReplies':
          update.aiRepliesUsed = usageStats.aiRepliesUsed + 1;
          break;
        case 'campaigns':
          update.campaignsUsed = usageStats.campaignsUsed + 1;
          break;
      }

      await this.updateUsageStats(userId, update);
    } catch (error) {
      console.error('[UserService] Error incrementing usage:', error);
      // Don't throw - usage tracking is not critical
    }
  }
}

export default new UserService(); 