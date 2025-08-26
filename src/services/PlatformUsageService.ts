import { UsageStats } from '../context/UsageContext';

export interface PlatformUsageBreakdown {
  platform: string;
  displayName: string;
  color: string;
  icon: string;
  count: number;
  percentage: number;
  breakdown: {
    posts: number;
    discussions: number;
    aiReplies: number;
    campaigns: number;
  };
  metadata: {
    lastActivity: Date;
    averageUsagePerDay: number;
    growthRate: number;
  };
}

export interface PlatformWeights {
  posts: number;
  discussions: number;
  aiReplies: number;
  campaigns: number;
}

export class PlatformUsageService {
  private static readonly PLATFORM_CONFIG = {
    instagram: {
      name: 'Instagram',
      color: '#E4405F',
      icon: '/icons/instagram.svg',
      // Instagram typically has higher visual content engagement
      weights: { posts: 0.45, discussions: 0.3, aiReplies: 0.25, campaigns: 0.1 },
      characteristics: {
        visualContent: true,
        engagement: 'high',
        audience: 'consumer'
      }
    },
    facebook: {
      name: 'Facebook', 
      color: '#1877F2',
      icon: '/icons/facebook.svg',
      // Facebook has balanced usage across features
      weights: { posts: 0.35, discussions: 0.35, aiReplies: 0.25, campaigns: 0.15 },
      characteristics: {
        visualContent: true,
        engagement: 'medium',
        audience: 'mixed'
      }
    },
    twitter: {
      name: 'Twitter',
      color: '#1DA1F2', 
      icon: '/icons/twitter.svg',
      // Twitter has more discussions and AI interactions
      weights: { posts: 0.25, discussions: 0.45, aiReplies: 0.35, campaigns: 0.1 },
      characteristics: {
        visualContent: false,
        engagement: 'high',
        audience: 'professional'
      }
    },
    linkedin: {
      name: 'LinkedIn',
      color: '#0077B5',
      icon: '/icons/linkedin.svg',
      // LinkedIn has more professional discussions and campaigns
      weights: { posts: 0.2, discussions: 0.5, aiReplies: 0.25, campaigns: 0.2 },
      characteristics: {
        visualContent: false,
        engagement: 'medium',
        audience: 'professional'
      }
    }
  };

  /**
   * Calculate platform-specific usage based on global usage stats and platform characteristics
   * @param usage Global usage statistics
   * @param acquiredPlatforms List of platform IDs that have been acquired
   * @returns Array of platform usage breakdowns
   */
  static calculatePlatformUsage(usage: UsageStats, acquiredPlatforms: string[]): PlatformUsageBreakdown[] {
    if (!acquiredPlatforms.length) return [];

    const platformUsage: PlatformUsageBreakdown[] = [];
    let totalApiCalls = 0;

    // Calculate usage for each acquired platform
    acquiredPlatforms.forEach(platformId => {
      const config = this.PLATFORM_CONFIG[platformId as keyof typeof this.PLATFORM_CONFIG];
      if (!config) return;

      const weights = config.weights;
      
      // Calculate weighted usage for each feature
      const postsUsage = Math.floor(usage.posts * weights.posts);
      const discussionsUsage = Math.floor(usage.discussions * weights.discussions);
      const aiRepliesUsage = Math.floor(usage.aiReplies * weights.aiReplies);
      const campaignsUsage = Math.floor(usage.campaigns * weights.campaigns);
      
      // Total platform API calls
      let platformApiCalls = postsUsage + discussionsUsage + aiRepliesUsage + campaignsUsage;

      // Ensure minimum visibility for acquired platforms
      if (platformApiCalls === 0 && this.hasAnyUsage(usage)) {
        platformApiCalls = this.calculateMinimumUsage(platformId, usage);
      }

      if (platformApiCalls > 0) {
        platformUsage.push({
          platform: platformId,
          displayName: config.name,
          color: config.color,
          icon: config.icon,
          count: platformApiCalls,
          percentage: 0, // Will be calculated below
          breakdown: {
            posts: postsUsage,
            discussions: discussionsUsage,
            aiReplies: aiRepliesUsage,
            campaigns: campaignsUsage
          },
          metadata: {
            lastActivity: new Date(),
            averageUsagePerDay: this.calculateAverageUsagePerDay(platformApiCalls),
            growthRate: this.calculateGrowthRate(platformId, platformApiCalls)
          }
        });
        totalApiCalls += platformApiCalls;
      }
    });

    // Calculate percentages based on actual totals
    if (totalApiCalls > 0) {
      platformUsage.forEach(platform => {
        platform.percentage = Math.round((platform.count / totalApiCalls) * 100);
      });
    }

    // Sort by usage count (highest first) for better UX
    platformUsage.sort((a, b) => b.count - a.count);

    return platformUsage;
  }

  /**
   * Check if there's any usage activity
   */
  private static hasAnyUsage(usage: UsageStats): boolean {
    return usage.posts > 0 || usage.discussions > 0 || usage.aiReplies > 0 || usage.campaigns > 0;
  }

  /**
   * Calculate minimum usage for acquired platforms to ensure visibility
   */
  private static calculateMinimumUsage(platformId: string, usage: UsageStats): number {
    const totalUsage = usage.posts + usage.discussions + usage.aiReplies + usage.campaigns;
    
    // Distribute minimal usage based on platform characteristics
    switch (platformId) {
      case 'instagram':
        return Math.max(1, Math.floor(totalUsage * 0.12));
      case 'facebook':
        return Math.max(1, Math.floor(totalUsage * 0.10));
      case 'twitter':
        return Math.max(1, Math.floor(totalUsage * 0.14));
      case 'linkedin':
        return Math.max(1, Math.floor(totalUsage * 0.16));
      default:
        return Math.max(1, Math.floor(totalUsage * 0.08));
    }
  }

  /**
   * Calculate average usage per day (placeholder for future implementation)
   */
  private static calculateAverageUsagePerDay(totalUsage: number): number {
    // This would be calculated based on historical data
    // For now, return a simple estimate
    return Math.ceil(totalUsage / 30); // Assume 30 days of usage
  }

  /**
   * Calculate growth rate (placeholder for future implementation)
   */
  private static calculateGrowthRate(platformId: string, currentUsage: number): number {
    // This would be calculated based on historical data
    // For now, return a placeholder value
    return Math.random() * 20 - 10; // Random value between -10 and 10
  }

  /**
   * Get platform configuration
   */
  static getPlatformConfig(platformId: string) {
    return this.PLATFORM_CONFIG[platformId as keyof typeof this.PLATFORM_CONFIG];
  }

  /**
   * Get all platform configurations
   */
  static getAllPlatformConfigs() {
    return this.PLATFORM_CONFIG;
  }

  /**
   * Validate platform weights (ensure they sum to reasonable values)
   */
  static validatePlatformWeights(platformId: string): boolean {
    const config = this.PLATFORM_CONFIG[platformId as keyof typeof this.PLATFORM_CONFIG];
    if (!config) return false;

    const weights = config.weights;
    const totalWeight = weights.posts + weights.discussions + weights.aiReplies + weights.campaigns;
    
    // Weights should sum to approximately 1.0 (allowing for some variance)
    return totalWeight >= 0.8 && totalWeight <= 1.2;
  }

  /**
   * Get platform characteristics for analytics
   */
  static getPlatformCharacteristics(platformId: string) {
    const config = this.PLATFORM_CONFIG[platformId as keyof typeof this.PLATFORM_CONFIG];
    return config?.characteristics || null;
  }
}
