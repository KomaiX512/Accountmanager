/**
 * Context Service - Provides AI Manager with real-time user context
 * Integrates with RAG server, platform data, and user information
 */

import axios from 'axios';
import { getApiUrl } from '../../config/api';

export interface UserContext {
  userId: string;
  username: string;
  platforms: PlatformInfo[];
  currentPlatform?: string;
  currentPage: string;
  stats: UserStats;
  competitors: CompetitorInfo[];
  recentActivity: Activity[];
}

export interface PlatformInfo {
  name: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  connected: boolean;
  username?: string;
  profileData?: any;
  lastSync?: string;
  postsCount?: number;
  followersCount?: number;
}

export interface UserStats {
  totalPosts: number;
  totalPlatforms: number;
  lastLogin: string;
  accountAge: string;
}

export interface CompetitorInfo {
  username: string;
  platform: string;
  recentPosts: number;
  engagement: string;
  trending: boolean;
}

export interface Activity {
  type: string;
  platform: string;
  description: string;
  timestamp: string;
}

class ContextService {
  /**
   * Get comprehensive user context for AI Manager
   */
  async getUserContext(userId: string): Promise<UserContext> {
    try {
      console.log('🔍 [ContextService] Fetching user context for:', userId);

      const [platforms, stats, competitors, activity] = await Promise.allSettled([
        this.getPlatformInfo(userId),
        this.getUserStats(userId),
        this.getCompetitorInsights(userId),
        this.getRecentActivity(userId)
      ]);

      // Get username from multiple sources (prioritize platform-specific)
      let username = 'user';
      const currentPlatform = this.getCurrentPlatform();
      
      // Try platform-specific username first
      const platformUsername = localStorage.getItem(`${currentPlatform}_username_${userId}`);
      if (platformUsername && platformUsername !== 'Sentient ai' && platformUsername !== userId) {
        username = platformUsername;
        console.log(`✅ [ContextService] Found username from ${currentPlatform}:`, username);
      } else {
        // Try accountHolder
        const accountHolder = localStorage.getItem('accountHolder');
        if (accountHolder && accountHolder !== 'Sentient ai') {
          username = accountHolder;
          console.log('✅ [ContextService] Found username from accountHolder:', username);
        } else {
          // Try any platform
          for (const platform of ['instagram', 'twitter', 'facebook', 'linkedin']) {
            const platformUser = localStorage.getItem(`${platform}_username_${userId}`);
            if (platformUser && platformUser !== 'Sentient ai' && platformUser !== userId) {
              username = platformUser;
              console.log(`✅ [ContextService] Found username from ${platform}:`, username);
              break;
            }
          }
        }
      }

      const context: UserContext = {
        userId,
        username,
        platforms: platforms.status === 'fulfilled' ? platforms.value : [],
        currentPage: window.location.pathname,
        stats: stats.status === 'fulfilled' ? stats.value : this.getDefaultStats(),
        competitors: competitors.status === 'fulfilled' ? competitors.value : [],
        recentActivity: activity.status === 'fulfilled' ? activity.value : []
      };

      console.log('✅ [ContextService] Context fetched:', context);
      return context;
    } catch (error) {
      console.error('❌ [ContextService] Error fetching context:', error);
      return this.getDefaultContext(userId);
    }
  }

  /**
   * Get current platform from URL
   */
  private getCurrentPlatform(): string {
    const path = window.location.pathname;
    if (path.includes('instagram')) return 'instagram';
    if (path.includes('twitter')) return 'twitter';
    if (path.includes('facebook')) return 'facebook';
    if (path.includes('linkedin')) return 'linkedin';
    return 'instagram'; // default
  }

  /**
   * Get information about user's connected platforms
   */
  private async getPlatformInfo(userId: string): Promise<PlatformInfo[]> {
    const platforms: PlatformInfo[] = [];
    const platformNames: Array<'instagram' | 'twitter' | 'facebook' | 'linkedin'> = 
      ['instagram', 'twitter', 'facebook', 'linkedin'];

    for (const platformName of platformNames) {
      try {
        // Check localStorage first
        const accessed = localStorage.getItem(`${platformName}_accessed_${userId}`);
        const username = localStorage.getItem(`${platformName}_username_${userId}`);
        
        if (accessed === 'true' && username) {
          // Try to get profile data from RAG
          const profileData = await this.getProfileData(platformName, username);
          
          platforms.push({
            name: platformName,
            connected: true,
            username,
            profileData,
            postsCount: profileData?.posts?.length || 0,
            lastSync: localStorage.getItem(`${platformName}_last_sync_${userId}`) || undefined
          });
        } else {
          platforms.push({
            name: platformName,
            connected: false
          });
        }
      } catch (error) {
        console.error(`Error checking ${platformName}:`, error);
        platforms.push({
          name: platformName,
          connected: false
        });
      }
    }

    return platforms;
  }

  /**
   * Get profile data from RAG server
   */
  private async getProfileData(platform: string, username: string): Promise<any> {
    try {
      const response = await axios.post(
        getApiUrl('/api/chat'),
        {
          message: `Get profile information for ${username} on ${platform}`,
          platform,
          username,
          conversationHistory: []
        },
        { timeout: 5000 }
      );
      return response.data.profileData;
    } catch (error) {
      console.warn(`Could not fetch profile data for ${username}:`, error);
      return null;
    }
  }

  /**
   * Get user statistics
   */
  private async getUserStats(userId: string): Promise<UserStats> {
    try {
      // Get from localStorage or API
      const lastLogin = localStorage.getItem(`last_login_${userId}`) || new Date().toISOString();
      const accountCreated = localStorage.getItem(`account_created_${userId}`) || new Date().toISOString();
      
      const accountAgeMs = Date.now() - new Date(accountCreated).getTime();
      const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));
      
      return {
        totalPosts: parseInt(localStorage.getItem(`total_posts_${userId}`) || '0'),
        totalPlatforms: this.getConnectedPlatformsCount(userId),
        lastLogin,
        accountAge: accountAgeDays > 0 ? `${accountAgeDays} days` : 'Today'
      };
    } catch (error) {
      return this.getDefaultStats();
    }
  }

  /**
   * Get competitor insights
   */
  private async getCompetitorInsights(userId: string): Promise<CompetitorInfo[]> {
    try {
      const competitors: CompetitorInfo[] = [];
      
      // Get competitors from localStorage for each platform
      const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
      for (const platform of platforms) {
        const competitorsList = localStorage.getItem(`${platform}_competitors_${userId}`);
        if (competitorsList) {
          const competitorUsernames = JSON.parse(competitorsList);
          competitorUsernames.forEach((username: string) => {
            competitors.push({
              username,
              platform,
              recentPosts: Math.floor(Math.random() * 10) + 1, // Placeholder
              engagement: 'High', // Placeholder
              trending: Math.random() > 0.7
            });
          });
        }
      }
      
      return competitors;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get recent activity
   */
  private async getRecentActivity(userId: string): Promise<Activity[]> {
    try {
      const activityLog = localStorage.getItem(`activity_log_${userId}`);
      if (activityLog) {
        return JSON.parse(activityLog).slice(0, 10);
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate context-aware greeting
   */
  async generateGreeting(context: UserContext): Promise<string> {
    const hour = new Date().getHours();
    let timeGreeting = 'Good evening';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 18) timeGreeting = 'Good afternoon';
    else if (hour < 22) timeGreeting = 'Good evening';
    else timeGreeting = 'Good night';

    const connectedPlatforms = context.platforms.filter(p => p.connected);
    const platformNames = connectedPlatforms.map(p => p.name).join(', ');

    let greeting = `${timeGreeting}, ${context.username}! 👋\n\n`;

    if (connectedPlatforms.length > 0) {
      greeting += `You have ${connectedPlatforms.length} platform${connectedPlatforms.length > 1 ? 's' : ''} connected: ${platformNames}.\n\n`;
      
      // Check if there are trending competitors
      const trendingCompetitors = context.competitors.filter(c => c.trending);
      if (trendingCompetitors.length > 0) {
        greeting += `🔥 ${trendingCompetitors.length} of your competitors are trending right now!\n\n`;
      }
    } else {
      greeting += `Let's get started! Connect your first platform to begin.\n\n`;
    }

    greeting += `How can I help you today?`;
    return greeting;
  }

  /**
   * Format context for Gemini system instruction
   */
  formatContextForAI(context: UserContext): string {
    const connectedPlatforms = context.platforms
      .filter(p => p.connected)
      .map(p => `${p.name} (@${p.username})`)
      .join(', ');

    const competitorsList = context.competitors
      .slice(0, 5)
      .map(c => `${c.username} on ${c.platform}`)
      .join(', ');

    return `
CURRENT USER CONTEXT:
- User: ${context.username}
- Connected Platforms: ${connectedPlatforms || 'None'}
- Total Posts: ${context.stats.totalPosts}
- Account Age: ${context.stats.accountAge}
- Top Competitors: ${competitorsList || 'None'}
- Current Page: ${context.currentPage}

USER STATUS:
${context.platforms.map(p => `- ${p.name}: ${p.connected ? `✅ Connected (@${p.username}, ${p.postsCount} posts)` : '❌ Not connected'}`).join('\n')}

IMPORTANT:
- If user asks about platforms, tell them about the above connected platforms
- If user asks to create posts on unconnected platforms, tell them to connect first
- Be natural and conversational, not robotic
- Reference their actual data when relevant
- If asked about competitors, mention the ones listed above
`.trim();
  }

  /**
   * Helper methods
   */
  private getConnectedPlatformsCount(userId: string): number {
    let count = 0;
    ['instagram', 'twitter', 'facebook', 'linkedin'].forEach(platform => {
      if (localStorage.getItem(`${platform}_accessed_${userId}`) === 'true') {
        count++;
      }
    });
    return count;
  }

  private getDefaultStats(): UserStats {
    return {
      totalPosts: 0,
      totalPlatforms: 0,
      lastLogin: new Date().toISOString(),
      accountAge: 'New'
    };
  }

  private getDefaultContext(userId: string): UserContext {
    return {
      userId,
      username: 'user',
      platforms: [],
      currentPage: window.location.pathname,
      stats: this.getDefaultStats(),
      competitors: [],
      recentActivity: []
    };
  }
}

export const contextService = new ContextService();
