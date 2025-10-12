/**
 * Context Service - Provides AI Manager with real-time user context
 * Integrates with RAG server, platform data, and user information
 */

import axios from 'axios';
import { getApiUrl } from '../../config/api';

export interface UserContext {
  userId: string;
  realName: string; // User's REAL name from Firebase (e.g., "Komail Hassan")
  platforms: PlatformInfo[]; // Each platform has its own username
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
   * @param userId - Firebase user ID
   * @param realName - User's real name from Firebase currentUser.displayName
   */
  async getUserContext(userId: string, realName?: string): Promise<UserContext> {
    try {
      console.log('🔍 [ContextService] Fetching user context for:', userId);

      const [platforms, stats, competitors, activity] = await Promise.allSettled([
        this.getPlatformInfo(userId),
        this.getUserStats(userId),
        this.getCompetitorInsights(userId),
        this.getRecentActivity(userId)
      ]);

      // CRITICAL: Use REAL NAME for AI to address the user, NOT platform usernames
      // Real name comes from Firebase displayName (e.g., "Komail Hassan")
      // Platform usernames (e.g., @muhammad_muti) are stored per-platform in platforms array
      let finalRealName = realName || 'there';
      if (!realName || realName === 'Sentient ai' || realName === userId) {
        // Fallback to first connected platform username only if no real name
        const connectedPlatform = platforms.status === 'fulfilled' 
          ? platforms.value.find(p => p.connected && p.username)
          : null;
        if (connectedPlatform?.username) {
          finalRealName = connectedPlatform.username;
          console.log(`⚠️ [ContextService] No real name provided, using ${connectedPlatform.name} username as fallback:`, finalRealName);
        }
      } else {
        console.log(`✅ [ContextService] Using real name from Firebase:`, finalRealName);
      }

      const context: UserContext = {
        userId,
        realName: finalRealName,
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
   * Get information about user's connected platforms
   * CRITICAL: Fetches platform-specific username from BACKEND R2, not localStorage
   */
  private async getPlatformInfo(userId: string): Promise<PlatformInfo[]> {
    const platforms: PlatformInfo[] = [];
    const platformNames: Array<'instagram' | 'twitter' | 'facebook' | 'linkedin'> = 
      ['instagram', 'twitter', 'facebook', 'linkedin'];

    for (const platformName of platformNames) {
      try {
        console.log(`🔍 [ContextService] Checking ${platformName} status from backend...`);
        
        // ALWAYS check backend R2 for platform status (source of truth)
        const statusResponse = await axios.get(
          getApiUrl(`/api/user-${platformName}-status/${userId}`),
          { timeout: 5000, validateStatus: () => true }
        );
        
        if (statusResponse.status === 200 && statusResponse.data) {
          const statusData = statusResponse.data;
          const hasEnteredKey = platformName === 'twitter' ? 'hasEnteredTwitterUsername'
            : platformName === 'facebook' ? 'hasEnteredFacebookUsername'
            : platformName === 'linkedin' ? 'hasEnteredLinkedInUsername'
            : 'hasEnteredInstagramUsername';
          
          const usernameKey = `${platformName}_username`;
          const connected = Boolean(statusData[hasEnteredKey]);
          const username = statusData[usernameKey];
          
          if (connected && username) {
            console.log(`✅ [ContextService] ${platformName} connected: @${username}`);
            
            // Try to get profile data (optional, don't fail if unavailable)
            let profileData = null;
            try {
              profileData = await this.getProfileData(platformName, username);
            } catch (err) {
              console.warn(`⚠️ Could not fetch profile data for ${username}:`, err);
            }
            
            platforms.push({
              name: platformName,
              connected: true,
              username,
              profileData,
              postsCount: profileData?.posts?.length || 0,
              lastSync: new Date().toISOString()
            });
          } else {
            console.log(`❌ [ContextService] ${platformName} not connected`);
            platforms.push({
              name: platformName,
              connected: false
            });
          }
        } else {
          console.log(`❌ [ContextService] ${platformName} status check failed (${statusResponse.status})`);
          platforms.push({
            name: platformName,
            connected: false
          });
        }
      } catch (error: any) {
        console.error(`❌ [ContextService] Error checking ${platformName}:`, error.message);
        platforms.push({
          name: platformName,
          connected: false
        });
      }
    }

    console.log(`📊 [ContextService] Platform summary: ${platforms.filter(p => p.connected).length}/${platforms.length} connected`);
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
    const platformNames = connectedPlatforms.map(p => `${p.name} (@${p.username})`).join(', ');

    let greeting = `${timeGreeting}, ${context.realName}! 👋\n\n`;

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
- User's Real Name: ${context.realName} (ALWAYS address user by this name, NOT by platform username)
- User ID: ${context.userId}
- Connected Platforms: ${connectedPlatforms || 'None'}
- Total Posts: ${context.stats.totalPosts}
- Account Age: ${context.stats.accountAge}
- Top Competitors: ${competitorsList || 'None'}
- Current Page: ${context.currentPage}

PLATFORM STATUS (Each platform has its OWN username):
${context.platforms.map(p => `- ${p.name}: ${p.connected ? `✅ Connected (username: @${p.username}, ${p.postsCount} posts)` : '❌ Not connected'}`).join('\n')}

CRITICAL RULES:
1. ALWAYS address the user by their real name "${context.realName}", NEVER by userId or platform username
2. When user asks "what is my name?", respond with "${context.realName}"
3. Each platform has a DIFFERENT username - Instagram username ≠ Twitter username
4. When retrieving data, use the SPECIFIC platform's username, not a generic username
5. If user asks about a platform that shows "❌ Not connected", tell them it's not connected
6. If asked about competitors, mention the ones listed above
7. Be natural and conversational, not robotic
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

  private getDefaultContext(userId: string, realName?: string): UserContext {
    return {
      userId,
      realName: realName || 'user',
      platforms: [],
      currentPage: window.location.pathname,
      stats: this.getDefaultStats(),
      competitors: [],
      recentActivity: []
    };
  }
}

export const contextService = new ContextService();
