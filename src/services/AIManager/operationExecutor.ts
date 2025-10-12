/**
 * Operation Executor - Executes operations called by AI Manager
 * Connects AI-detected operations to actual application functionality
 */

import { operationRegistry, OperationContext, OperationResult } from './operationRegistry';
import { getApiUrl } from '../../config/api';
import axios from 'axios';

export class OperationExecutor {
  /**
   * Check if platform is connected/acquired
   */
  private async isPlatformConnected(platform: string, userId: string): Promise<boolean> {
    try {
      console.log(`🔍 [Platform Check] Checking ${platform} for user ${userId}`);
      
      // Check localStorage first (instant UX)
      const localCheck = localStorage.getItem(`${platform}_accessed_${userId}`);
      console.log(`📂 [Platform Check] localStorage ${platform}_accessed_${userId}:`, localCheck);
      
      if (localCheck === 'true') {
        const username = localStorage.getItem(`${platform}_username_${userId}`);
        console.log(`✅ [Platform Check] Found in localStorage, username:`, username);
        return !!username;
      }

      // FALLBACK: Check if accountHolder exists (user connected via dashboard)
      const accountHolder = localStorage.getItem('accountHolder');
      const platformUsername = localStorage.getItem(`${platform}Username`); // Some platforms use this format
      console.log(`📂 [Platform Check] Fallback - accountHolder:`, accountHolder, `${platform}Username:`, platformUsername);
      
      if (accountHolder || platformUsername) {
        console.log(`✅ [Platform Check] Found via fallback (dashboard connection)`);
        // Update localStorage for next time
        localStorage.setItem(`${platform}_accessed_${userId}`, 'true');
        if (accountHolder) localStorage.setItem(`${platform}_username_${userId}`, accountHolder);
        return true;
      }

      // Check backend with timeout and validateStatus
      console.log(`🌐 [Platform Check] Checking backend API...`);
      const statusEndpoint = `/api/user-${platform}-status/${userId}`;
      const response = await axios.get(getApiUrl(statusEndpoint), {
        timeout: 5000,
        validateStatus: () => true
      });
      
      if (response.status >= 200 && response.status < 300) {
        const data = response.data || {};
        const hasEnteredKey = platform === 'twitter' ? 'hasEnteredTwitterUsername'
          : platform === 'facebook' ? 'hasEnteredFacebookUsername'
          : platform === 'linkedin' ? 'hasEnteredLinkedInUsername'
          : 'hasEnteredInstagramUsername';
        const connected = Boolean(data[hasEnteredKey]);
        console.log(`${connected ? '✅' : '❌'} [Platform Check] Backend says:`, connected);
        return connected;
      }
      
      console.log(`❌ [Platform Check] All checks failed`);
      return false;
    } catch (error) {
      console.error(`❌ [Platform Check] Error:`, error);
      return false;
    }
  }

  /**
   * Execute a single operation
   */
  async execute(
    operationId: string,
    parameters: any,
    context: OperationContext
  ): Promise<OperationResult> {
    try {
      console.log(`🚀 Executing operation: ${operationId}`, parameters);

      const operation = operationRegistry.get(operationId);
      if (!operation) {
        return {
          success: false,
          message: `Operation '${operationId}' not found`
        };
      }

      // Check if platform is connected for operations that require it
      if (operation.requiresPlatform || operationId.includes('post') || operationId.includes('schedule')) {
        const targetPlatform = parameters.platform || context.platform;
        if (!targetPlatform) {
          return {
            success: false,
            message: 'Which platform would you like to use? Please specify: Instagram, Twitter, Facebook, or LinkedIn.',
            requiresInput: {
              field: 'platform',
              prompt: 'Which platform?',
              type: 'string'
            }
          };
        }

        // Check if platform is acquired (except for acquire_platform operation itself)
        if (operationId !== 'acquire_platform' && context.userId) {
          const isConnected = await this.isPlatformConnected(targetPlatform, context.userId);
          if (!isConnected) {
            return {
              success: false,
              message: `❌ You haven't connected your ${targetPlatform.charAt(0).toUpperCase() + targetPlatform.slice(1)} account yet! Please acquire the platform first by saying: "Acquire ${targetPlatform} with username [your-username] and competitors [competitor1, competitor2, competitor3]"`,
              nextSteps: [
                `Say: "Acquire ${targetPlatform}"`,
                'I will guide you through connecting your account'
              ]
            };
          }
        }
      }

      // Validate required parameters
      const validation = this.validateParameters(operation.parameters, parameters);
      if (!validation.valid) {
        return {
          success: false,
          message: `I need more information. Missing: ${validation.missing.join(', ')}. ${this.getParameterPrompt(operation.id, validation.missing)}`,
          requiresInput: validation.missing.map(param => ({
            field: param,
            prompt: `Please provide ${param}`,
            type: 'string'
          }))[0]
        };
      }

      // Check auth requirements
      if (operation.requiresAuth && !context.userId) {
        return {
          success: false,
          message: 'Authentication required for this operation'
        };
      }

      // Execute operation-specific logic
      const result = await this.executeOperation(operationId, parameters, context);
      
      console.log(`✅ Operation ${operationId} completed:`, result);
      return result;

    } catch (error: any) {
      console.error(`❌ Operation ${operationId} failed:`, error);
      return {
        success: false,
        message: `Operation failed: ${error.message}`
      };
    }
  }

  /**
   * Get helpful prompt for missing parameters
   */
  private getParameterPrompt(operationId: string, missing: string[]): string {
    if (operationId === 'acquire_platform') {
      if (missing.includes('username')) {
        return 'What\'s your account username?';
      }
      if (missing.includes('competitors')) {
        return 'Please provide at least 3 competitor usernames (e.g., nike, adidas, puma)';
      }
      if (missing.includes('accountType')) {
        return 'What type of account? (personal, business, creator, or brand)';
      }
    }
    return 'Please provide the required information.';
  }

  /**
   * Validate operation parameters
   */
  private validateParameters(
    schema: any[],
    params: any
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const param of schema) {
      if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
        missing.push(param.name);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Execute specific operations with real implementations
   */
  private async executeOperation(
    operationId: string,
    params: any,
    context: OperationContext
  ): Promise<OperationResult> {
    switch (operationId) {
      case 'acquire_platform':
        return this.acquirePlatform(params, context);
      
      case 'check_platform_status':
        return this.checkPlatformStatus(params, context);
      
      case 'get_status':
        return this.getStatus(params, context);
      
      case 'create_post':
        return this.createPost(params, context);
      
      case 'create_post_from_news':
        return this.createPostFromNews(params, context);
      
      case 'schedule_post':
        return this.schedulePost(params, context);
      
      case 'auto_schedule_posts':
        return this.autoSchedulePosts(params, context);
      
      case 'get_analytics':
        return this.getAnalytics(params, context);
      
      case 'get_competitor_analysis':
        return this.getCompetitorAnalysis(params, context);
      
      case 'get_news_summary':
        return this.getNewsSummary(params, context);
      
      case 'get_strategies':
        return this.getStrategies(params, context);
      
      case 'navigate_to':
        return this.navigateTo(params, context);
      
      case 'open_module':
        return this.openModule(params, context);
      
      case 'update_settings':
        return this.updateSettings(params, context);
      
      default:
        return {
          success: false,
          message: `Operation '${operationId}' not implemented`
        };
    }
  }

  /**
   * PLATFORM OPERATIONS
   */
  private async acquirePlatform(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, username, competitors, accountType, postingStyle } = params;

      // Store account info in localStorage
      localStorage.setItem('accountHolder', username);
      localStorage.setItem(`${platform}_username_${context.userId}`, username);
      localStorage.setItem(`${platform}_accountType`, accountType || 'business');
      
      if (postingStyle) {
        localStorage.setItem(`${platform}_postingStyle`, postingStyle);
      }

      // Store competitors (WITH userId for consistency)
      if (competitors && Array.isArray(competitors)) {
        localStorage.setItem(`${platform}_competitors_${context.userId}`, JSON.stringify(competitors));
        localStorage.setItem(`${platform}_competitors`, JSON.stringify(competitors)); // Backward compat
      }

      // Call backend account info endpoint
      await axios.post(getApiUrl('/api/save-account-info'), {
        username,
        accountType: accountType || 'business',
        postingStyle: postingStyle || 'professional',
        competitors,
        platform
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      // Mark platform as accessed
      if (context.userId) {
        localStorage.setItem(`${platform}_accessed_${context.userId}`, 'true');
      }

      // Navigate to processing page
      window.location.assign(`/processing/${platform}`);

      return {
        success: true,
        message: `🚀 Acquiring ${platform} account @${username}. This will take approximately 15 minutes. You'll be notified when processing completes.`,
        data: { 
          platform, 
          username, 
          processingStarted: true,
          estimatedTime: '15 minutes'
        },
        nextSteps: [
          'Monitor processing status on the screen',
          'Wait for completion notification',
          'Dashboard will load automatically when ready'
        ]
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to acquire platform: ${error.message}`
      };
    }
  }

  private async checkPlatformStatus(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform } = params;
      const statusEndpoint = `/api/user-${platform}-status/${context.userId}`;
      const response = await axios.get(getApiUrl(statusEndpoint), { 
        timeout: 5000, 
        validateStatus: () => true 
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.data || {};
        const hasEnteredKey = platform === 'twitter' ? 'hasEnteredTwitterUsername'
          : platform === 'facebook' ? 'hasEnteredFacebookUsername'
          : platform === 'linkedin' ? 'hasEnteredLinkedInUsername'
          : 'hasEnteredInstagramUsername';
        const isConnected = Boolean(data[hasEnteredKey]);
        const usernameKey = platform === 'twitter' ? 'twitter_username'
          : platform === 'facebook' ? 'facebook_username'
          : platform === 'linkedin' ? 'linkedin_username'
          : 'instagram_username';
        const username = data[usernameKey];

        return {
          success: true,
          message: isConnected 
            ? `✅ ${platform} is connected (@${username})`
            : `❌ ${platform} is not connected`,
          data: { platform, connected: isConnected, username }
        };
      }

      return {
        success: true,
        message: `${platform} is not connected yet`,
        data: { connected: false }
      };
    } catch (error: any) {
      return {
        success: true,
        message: `${params.platform} is not connected yet`,
        data: { connected: false }
      };
    }
  }

  /**
   * Get status overview - MCP-like awareness of connected platforms
   */
  private async getStatus(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      console.log('🔍 [AI Manager] Getting platform status for user:', context.userId);
      
      // Check specific platform or all platforms
      const platformsToCheck: Array<'instagram' | 'twitter' | 'facebook' | 'linkedin'> = params?.platform
        ? [params.platform]
        : ['instagram', 'twitter', 'facebook', 'linkedin'];

      const connectedPlatforms: string[] = [];
      const lines: string[] = [];

      // Check each platform via backend API (NO localStorage!)
      for (const p of platformsToCheck) {
        try {
          const statusEndpoint = `/api/user-${p}-status/${context.userId}`;
          const statusResp = await axios.get(getApiUrl(statusEndpoint), {
            timeout: 5000,
            validateStatus: () => true
          });

          if (statusResp.status >= 200 && statusResp.status < 300) {
            const statusData = statusResp.data || {};
            
            // Check if platform is actually connected
            const hasEnteredKey = p === 'twitter' ? 'hasEnteredTwitterUsername'
              : p === 'facebook' ? 'hasEnteredFacebookUsername'
              : p === 'linkedin' ? 'hasEnteredLinkedInUsername'
              : 'hasEnteredInstagramUsername';
            
            const usernameKey = `${p}_username`;
            const username = statusData[usernameKey];

            if (statusData[hasEnteredKey] === true && username) {
              connectedPlatforms.push(p);
              console.log(`✅ [AI Manager] ${p} connected: @${username}`);

              // Get profile info for stats
              const profileInfoUrl = p === 'linkedin'
                ? getApiUrl(`/api/profile-info/${p}/${username}`)
                : getApiUrl(`/api/profile-info/${username}?platform=${p}`);

              try {
                const profileResp = await axios.get(profileInfoUrl, { 
                  timeout: 5000, 
                  validateStatus: () => true 
                });
                
                const profileData = (profileResp.status >= 200 && profileResp.status < 300) ? (profileResp.data || {}) : {};
                const followers = profileData.followersCount ?? profileData.followers ?? profileData.follower_count ?? 'N/A';
                const postsCount = Array.isArray(profileData.posts) 
                  ? profileData.posts.length 
                  : (profileData.postsCount ?? profileData.totalPosts ?? 'N/A');
                
                lines.push(`• ${p.toUpperCase()} (@${username}) — followers: ${followers}, posts: ${postsCount}`);
              } catch {
                lines.push(`• ${p.toUpperCase()} (@${username}) — connected ✅`);
              }
            } else {
              console.log(`❌ [AI Manager] ${p} not connected`);
            }
          }
        } catch (error) {
          console.log(`⚠️  [AI Manager] Error checking ${p}:`, error);
        }
      }

      if (connectedPlatforms.length === 0) {
        return {
          success: true,
          message: 'You have no connected platforms yet. Say "Acquire Instagram/Twitter/Facebook/LinkedIn" to connect one.',
          data: { platforms: [] }
        };
      }

      return {
        success: true,
        message: `Here is your current status:\n\n${lines.join('\n')}\n\nAsk me to open a dashboard, create posts, or analyze competitors anytime.`,
        data: { platforms: connectedPlatforms }
      };
    } catch (error: any) {
      console.error('❌ [AI Manager] Get status error:', error);
      return { 
        success: false, 
        message: `Failed to get status: ${error.message}` 
      };
    }
  }

  /**
   * CONTENT OPERATIONS
   */
  private async createPost(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, includeImage, tone } = params;
      const targetPlatform = platform || context.platform || 'instagram';
      
      // Smart default for prompt if not provided
      const prompt = params.prompt || 'Create an engaging post about recent trends and insights';
      
      // Check if platform is connected
      if (!(await this.isPlatformConnected(targetPlatform, context.userId))) {
        return {
          success: false,
          message: `❌ ${targetPlatform.charAt(0).toUpperCase() + targetPlatform.slice(1)} is not connected. Connect it first to create posts for that platform.`
        };
      }

      // CRITICAL: Get username from localStorage (most reliable source)
      console.log(`📂 [CreatePost] Opening ${targetPlatform} account files...`);
      const username = localStorage.getItem(`${targetPlatform}_username_${context.userId}`) || 
                       localStorage.getItem('accountHolder');
      
      console.log(`✅ [CreatePost] Found ${targetPlatform} username: @${username}`);

      if (!username) {
        return {
          success: false,
          message: `❌ No ${targetPlatform} account connected. Please connect your account first.`
        };
      }

      console.log(`⏳ [CreatePost] Generating post for @${username} on ${targetPlatform}...`);
      console.log('🎨 [CreatePost] Calling RAG with:', {
        platform: targetPlatform,
        username,
        query: prompt
      });

      // Call RAG endpoint to generate post (RAG expects "query" not "prompt")
      // CRITICAL: 180s timeout to match server's image generation time (3 minutes)
      const response = await axios.post(getApiUrl('/api/post-generator'), {
        platform: targetPlatform,
        username: username,
        query: `Create a ${tone || 'professional'} ${targetPlatform} post about: ${prompt}${includeImage !== false ? '. Include visual elements.' : ''}`
      }, { timeout: 180000, validateStatus: () => true });

      // Validate response with helpful error messages
      if (response.status === 500 || response.status === 503) {
        return {
          success: false,
          message: `❌ Post generation service temporarily unavailable. The AI content generator may be warming up or under maintenance. Please try again in a moment.`
        };
      }
      
      if (response.status !== 200 || !response.data) {
        return {
          success: false,
          message: `❌ Post generation failed (status ${response.status}). Please try again or contact support if this persists.`
        };
      }

      // Extract caption for user feedback
      const caption = response.data.post?.post?.caption || response.data.response?.caption || '';
      const previewText = caption.length > 100 ? caption.substring(0, 100) + '...' : caption;

      // Dispatch event to refresh PostCooked module
      window.dispatchEvent(new CustomEvent('newPostCreated'));

      return {
        success: true,
        message: `✅ Post created successfully for @${username}!\n\n📝 Preview: "${previewText}"\n\n💡 Check your "Posts" module to view, edit, or schedule it.`,
        data: {
          postId: response.data.postId || 'generated',
          platform: targetPlatform,
          username: username,
          caption: caption
        },
        nextSteps: [
          'View the post in the "Cooked Posts" module',
          'Schedule it for publishing',
          'Edit if needed'
        ]
      };
    } catch (error: any) {
      console.error('❌ [CreatePost] Failed:', error);
      return {
        success: false,
        message: `❌ Failed to create post: ${error.response?.data?.message || error.message}`
      };
    }
  }

  private async createPostFromNews(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      console.log('📰 [AI Manager] Creating post from news:', params);
      
      const { platform, newsIndex, customization } = params;
      const targetPlatform = platform || context.platform || 'twitter';

      // Step 1: Get username from localStorage (most reliable, no network call needed)
      console.log(`📂 [CreatePostFromNews] Opening ${targetPlatform} account files...`);
      const username = localStorage.getItem(`${targetPlatform}_username_${context.userId}`) || 
                       localStorage.getItem('accountHolder');

      if (!username) {
        return {
          success: false,
          message: `❌ No ${targetPlatform} account connected. Please connect your account first.`
        };
      }

      console.log(`✅ [CreatePostFromNews] Found ${targetPlatform} username: @${username}`);

      // Step 2: Fetch trending news
      const newsResponse = await axios.get(
        getApiUrl(`/api/news-for-you/${username}?platform=${targetPlatform}&limit=4`),
        { timeout: 8000, validateStatus: () => true }
      );

      if (newsResponse.status !== 200 || !newsResponse.data) {
        return {
          success: false,
          message: `📰 No trending news available for ${targetPlatform} right now. Try again later.`
        };
      }

      // Parse news response - backend returns array with data object
      let newsItems = [];
      if (Array.isArray(newsResponse.data) && newsResponse.data.length > 0) {
        // Backend format: [{ data: { news_items: [...] } }]
        newsItems = newsResponse.data[0]?.data?.news_items || [];
      } else if (newsResponse.data.news_items) {
        // Direct format: { news_items: [...] }
        newsItems = newsResponse.data.news_items;
      } else if (Array.isArray(newsResponse.data)) {
        // Direct array format: [...]
        newsItems = newsResponse.data;
      }

      console.log(`📰 [AI Manager] Found ${newsItems.length} news items for ${targetPlatform}`);

      if (newsItems.length === 0) {
        return {
          success: false,
          message: `📰 No trending news available for ${targetPlatform} right now. Try again later.`
        };
      }

      // Step 3: Select news item (random if not specified)
      const selectedIndex = newsIndex !== undefined ? newsIndex : Math.floor(Math.random() * newsItems.length);
      const newsItem = newsItems[selectedIndex];

      if (!newsItem) {
        return {
          success: false,
          message: `❌ News item at index ${selectedIndex} not found (only ${newsItems.length} items available)`
        };
      }

      console.log(`📰 [AI Manager] Selected news: "${newsItem.title || newsItem.description}"`);

      // Step 4: Create post from news
      const postQuery = `Create an engaging ${targetPlatform} post about this trending news: ${newsItem.title || newsItem.description}. ${newsItem.content || newsItem.summary || ''}${customization ? ` Additional instructions: ${customization}` : ''}`;
      
      const response = await axios.post(
        getApiUrl('/api/post-generator'), 
        {
          platform: targetPlatform,
          username: username,
          query: postQuery,
          includeImage: true,
          tone: 'professional',
          newsSource: {
            title: newsItem.title,
            url: newsItem.url,
            source: newsItem.source
          }
        },
        { timeout: 180000, validateStatus: () => true }
      );

      // Step 5: Trigger frontend refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('newPostCreated', {
          detail: { platform: targetPlatform, username: username }
        }));
      }

      return {
        success: true,
        message: `✅ Post created from trending news!\n\n📰 Based on: "${newsItem.title || newsItem.description}"\n\n💡 Check your "Posts" module to review and publish it.`,
        data: {
          postId: response.data.postId || 'generated',
          newsTitle: newsItem.title,
          platform: targetPlatform,
          username: username
        }
      };
    } catch (error: any) {
      console.error('❌ [AI Manager] Create post from news failed:', error);
      return {
        success: false,
        message: `❌ Failed to create post from news: ${error.response?.status === 404 ? 'News service unavailable' : error.message}`
      };
    }
  }

  private async schedulePost(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { postId, platform, scheduledTime } = params;

      // Parse natural language time
      const scheduleDate = this.parseScheduleTime(scheduledTime);

      // Call scheduling endpoint (requires userId in path)
      await axios.post(getApiUrl(`/api/schedule-post/${context.userId}`), {
        postId,
        platform: platform || context.platform,
        username: context.username,
        scheduledTime: scheduleDate.toISOString()
      });

      return {
        success: true,
        message: `✅ Post scheduled for ${scheduleDate.toLocaleString()}`,
        data: {
          postId,
          scheduledTime: scheduleDate.toISOString(),
          formattedTime: scheduleDate.toLocaleString()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to schedule post: ${error.message}`
      };
    }
  }

  private async autoSchedulePosts(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, numberOfPosts, intervalHours } = params;
      const targetPlatform = platform || context.platform;

      // Trigger auto-schedule in PostCooked component via custom event
      window.dispatchEvent(new CustomEvent('aiManagerAutoSchedule', {
        detail: {
          platform: targetPlatform,
          numberOfPosts: numberOfPosts || 5,
          intervalHours: intervalHours || 24
        }
      }));

      return {
        success: true,
        message: `✅ Auto-scheduling ${numberOfPosts || 5} posts with ${intervalHours || 24} hour intervals. Check the "Cooked Posts" module for progress.`,
        data: {
          platform: targetPlatform,
          numberOfPosts: numberOfPosts || 5,
          intervalHours: intervalHours || 24
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to auto-schedule posts: ${error.message}`
      };
    }
  }

  /**
   * ANALYTICS OPERATIONS
   */
  private async getAnalytics(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      console.log('📊 [AI Manager] Getting analytics:', params);
      
      const { platform, timeRange = '30d' } = params;
      const targetPlatform = platform && platform !== 'all' ? platform : context.platform || 'twitter';
      
      // Check if platform is connected
      if (!(await this.isPlatformConnected(targetPlatform, context.userId))) {
        return {
          success: false,
          message: `❌ ${targetPlatform.charAt(0).toUpperCase() + targetPlatform.slice(1)} is not connected. Please connect your ${targetPlatform} account first in Settings.`
        };
      }

      // ALWAYS fetch platform-specific username from backend
      let username = null;
      const statusResp = await axios.get(
        getApiUrl(`/api/user-${targetPlatform}-status/${context.userId}`),
        { timeout: 30000, validateStatus: () => true }
      );
      
      if (statusResp.status >= 200 && statusResp.status < 300) {
        username = statusResp.data[`${targetPlatform}_username`];
        console.log(`✅ [AI Manager] Fetched ${targetPlatform} username: @${username}`);
      }

      if (!username) {
        return {
          success: false,
          message: `❌ No ${targetPlatform} account connected. Please connect your account first.`
        };
      }

      console.log(`✅ [AI Manager] Fetching analytics for @${username} on ${targetPlatform}`);

      // Fetch profile analytics
      const profileEndpoint = targetPlatform === 'linkedin' 
        ? `/api/profile-info/${targetPlatform}/${username}`
        : `/api/profile-info/${username}?platform=${targetPlatform}`;
      const profileResp = await axios.get(
        getApiUrl(profileEndpoint),
        { timeout: 8000, validateStatus: () => true }
      );

      if (profileResp.status !== 200) {
        return {
          success: false,
          message: `❌ Could not fetch analytics for ${targetPlatform}. API returned status ${profileResp.status}.`
        };
      }

      const profileData = profileResp.data || {};
      
      // Build analytics summary
      const summary: string[] = [];
      summary.push(`📊 **${targetPlatform.toUpperCase()} Analytics Summary** (@${username})\n`);

      const followers = profileData.followersCount || profileData.followers || profileData.follower_count || 0;
      const following = profileData.followingCount || profileData.following || profileData.following_count || 0;
      const posts = Array.isArray(profileData.posts) 
        ? profileData.posts.length 
        : (profileData.postsCount || profileData.totalPosts || 0);
      const engagement = profileData.engagementRate || profileData.engagement_rate || 'N/A';
      const reach = profileData.totalReach || profileData.reach || 'N/A';

      // Key metrics
      summary.push(`📈 **Key Metrics:**`);
      summary.push(`• Followers: ${followers.toLocaleString()}`);
      summary.push(`• Following: ${following.toLocaleString()}`);
      summary.push(`• Total Posts: ${posts}`);
      if (engagement !== 'N/A') {
        summary.push(`• Engagement Rate: ${engagement}%`);
      }
      if (reach !== 'N/A') {
        summary.push(`• Total Reach: ${reach.toLocaleString()}`);
      }
      
      // Recent activity
      if (Array.isArray(profileData.posts) && profileData.posts.length > 0) {
        const recentPosts = profileData.posts.slice(0, 3);
        summary.push(`\n📝 **Recent Posts:**`);
        recentPosts.forEach((post: any, idx: number) => {
          const likes = post.likesCount || post.likes || 0;
          const comments = post.commentsCount || post.comments || 0;
          summary.push(`${idx + 1}. ${likes} likes, ${comments} comments`);
        });
      }

      // Growth insights
      summary.push(`\n💡 **Insights:**`);
      if (followers > 1000) {
        summary.push(`• Strong follower base - you're building authority`);
      } else {
        summary.push(`• Growing phase - focus on consistent posting`);
      }
      
      if (posts < 10) {
        summary.push(`• Low post count - aim for 3-5 posts per week`);
      } else if (posts > 50) {
        summary.push(`• Active poster - maintain this momentum!`);
      }

      const followerToFollowingRatio = following > 0 ? (followers / following) : 0;
      if (followerToFollowingRatio > 2) {
        summary.push(`• Excellent follower-to-following ratio (${followerToFollowingRatio.toFixed(1)}x)`);
      }

      return {
        success: true,
        message: summary.join('\n'),
        data: {
          platform: targetPlatform,
          username: username,
          metrics: {
            followers, following, posts, engagement, reach,
            followerToFollowingRatio
          },
          timeRange
        }
      };
    } catch (error: any) {
      console.error('❌ [AI Manager] Analytics failed:', error);
      return {
        success: false,
        message: `❌ Failed to retrieve analytics: ${error.message}`
      };
    }
  }

  private async getCompetitorAnalysis(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, competitor } = params;
      const targetPlatform = platform || context.platform || 'instagram';
      
      // Check if platform is connected
      if (!(await this.isPlatformConnected(targetPlatform, context.userId))) {
        return {
          success: false,
          message: `❌ ${targetPlatform.charAt(0).toUpperCase() + targetPlatform.slice(1)} is not connected. Connect it first to analyze competitors on that platform.`
        };
      }

      console.log(`🤖 [CompetitorAnalysis] Using AGENTIC BACKEND for ${targetPlatform}...`);

      // If specific competitor requested, analyze just that one
      if (competitor) {
        console.log(`📂 Analyzing specific competitor: @${competitor}...`);
        
        const response = await axios.post(
          getApiUrl('/api/ai-manager/analyze-competitor'),
          {
            userId: context.userId,
            platform: targetPlatform,
            competitorUsername: competitor
          },
          { timeout: 60000, validateStatus: () => true }
        );

        if (response.status === 200 && response.data.success) {
          return {
            success: true,
            message: response.data.message,
            data: response.data.data
          };
        } else {
          return {
            success: false,
            message: response.data.message || 'Failed to analyze competitor'
          };
        }
      }

      // Get overall competitive analysis from backend
      console.log(`📊 Getting competitive landscape analysis...`);
      
      // Get competitors from localStorage to pass to backend
      const competitorsJson = localStorage.getItem(`${targetPlatform}_competitors_${context.userId}`) || 
                              localStorage.getItem(`${targetPlatform}_competitors`);
      let competitors = [];
      if (competitorsJson) {
        try {
          competitors = JSON.parse(competitorsJson);
          console.log(`📋 Found ${competitors.length} competitors in localStorage:`, competitors);
        } catch (e) {
          console.warn('Failed to parse competitors from localStorage');
        }
      }
      
      const response = await axios.post(
        getApiUrl('/api/ai-manager/competitor-analysis'),
        {
          userId: context.userId,
          platform: targetPlatform,
          competitors: competitors // Pass competitors from localStorage
        },
        { timeout: 60000, validateStatus: () => true }
      );

      if (response.status === 200 && response.data.success) {
        return {
          success: true,
          message: response.data.message,
          data: response.data.data
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Failed to get competitor analysis'
        };
      }
      
    } catch (error: any) {
      console.error('❌ [CompetitorAnalysis] Failed:', error);
      return {
        success: false,
        message: `❌ Failed to analyze competitors: ${error.response?.data?.message || error.message}`
      };
    }
  }

  private async getNewsSummary(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      console.log('📰 [AI Manager] Getting AI-powered news summary...');
      
      const { platform } = params;
      const targetPlatform = platform || context.platform || 'instagram';
      
      // Check if platform is connected
      if (!(await this.isPlatformConnected(targetPlatform, context.userId))) {
        return {
          success: false,
          message: `❌ ${targetPlatform.charAt(0).toUpperCase() + targetPlatform.slice(1)} is not connected. Connect it first to see trending news for that platform.`
        };
      }

      // Use NEW agentic backend that reads files and summarizes with AI
      const response = await axios.post(
        getApiUrl('/api/ai-manager/news-summary'),
        {
          userId: context.userId,
          platform: targetPlatform
        },
        { timeout: 30000, validateStatus: () => true }
      );

      if (response.status === 200 && response.data.success) {
        return {
          success: true,
          message: response.data.message,
          data: response.data.data
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Failed to get news summary'
        };
      }
      
    } catch (error: any) {
      console.error('❌ [AI Manager] News summary failed:', error);
      return {
        success: false,
        message: `❌ Failed to fetch news: ${error.response?.data?.message || error.message}`
      };
    }
  }

  private async getStrategies(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      console.log('💡 [AI Manager] Getting strategies:', params);
      
      const { platform, limit = 5 } = params;
      const targetPlatform = platform || context.platform || 'instagram';

      console.log(`📂 [Strategies] Opening ${targetPlatform} strategy files...`);

      // CRITICAL: Get username from localStorage (most reliable source)
      const username = localStorage.getItem(`${targetPlatform}_username_${context.userId}`) || 
                       localStorage.getItem('accountHolder');
      
      console.log(`✅ [Strategies] Found ${targetPlatform} username: @${username}`);

      if (!username) {
        return {
          success: false,
          message: `❌ No ${targetPlatform} account connected. Please connect your account first.`
        };
      }

      console.log(`⏳ [Strategies] Loading strategy data for @${username}...`);

      // Fetch strategies from backend
      const strategiesResp = await axios.get(
        getApiUrl(`/api/retrieve-strategies/${username}?platform=${targetPlatform}`),
        { timeout: 8000, validateStatus: () => true }
      );

      if (strategiesResp.status !== 200 || !strategiesResp.data) {
        console.warn(`⚠️ [Strategies] API returned ${strategiesResp.status}`);
        return {
          success: false,
          message: `❌ No strategies available for @${username} on ${targetPlatform}.\n\nAPI Status: ${strategiesResp.status}\nStrategies may not have been generated yet. Try creating some posts first to build strategy data.`
        };
      }

      const strategies = Array.isArray(strategiesResp.data) ? strategiesResp.data : [strategiesResp.data];
      console.log(`✅ [Strategies] Found ${strategies.length} strategies`);

      if (strategies.length === 0) {
        return {
          success: false,
          message: `💡 No strategies found for @${username} on ${targetPlatform}.\n\nStart creating posts and the AI will automatically generate personalized strategies based on your content and audience.`
        };
      }

      // Format strategies for display
      const summary: string[] = [];
      summary.push(`💡 **Recommended Strategies for ${targetPlatform.toUpperCase()}** (@${username})\n`);

      const displayStrategies = strategies.slice(0, limit);
      displayStrategies.forEach((strategy: any, idx: number) => {
        summary.push(`**${idx + 1}. ${strategy.title || strategy.strategy || `Strategy ${idx + 1}`}**`);
        
        if (strategy.description) {
          summary.push(`   ${strategy.description}`);
        }
        
        if (strategy.actionItems && Array.isArray(strategy.actionItems)) {
          summary.push(`   **Action Items:**`);
          strategy.actionItems.slice(0, 3).forEach((action: string) => {
            summary.push(`   • ${action}`);
          });
        }
        
        if (strategy.priority) {
          summary.push(`   Priority: ${strategy.priority}`);
        }
        
        summary.push('');
      });

      if (strategies.length > limit) {
        summary.push(`\n📊 ${strategies.length - limit} more strategies available. Ask me to show more!`);
      }

      return {
        success: true,
        message: summary.join('\n'),
        data: {
          platform: targetPlatform,
          username: username,
          strategiesCount: strategies.length,
          displayed: displayStrategies.length
        }
      };
    } catch (error: any) {
      console.error('❌ [Strategies] Failed:', error);
      return {
        success: false,
        message: `❌ Failed to retrieve strategies: ${error.response?.data?.message || error.message}\n\n**Debug Info:**\n• Platform: ${params.platform || 'instagram'}\n• Error: ${error.message}\n• Status: ${error.response?.status || 'Network Error'}`
      };
    }
  }

  /**
   * NAVIGATION OPERATIONS
   */
  private async navigateTo(params: any, _context: OperationContext): Promise<OperationResult> {
    try {
      const { destination } = params;

      // Only map to routes that actually exist in App.tsx
      const routeMap: Record<string, string> = {
        'main-dashboard': '/account',
        'instagram': '/instagram',
        'twitter': '/twitter',
        'facebook': '/facebook',
        'linkedin': '/linkedin',
        'pricing': '/pricing',
        'home': '/',
        'homepage': '/',
        'privacy': '/privacy',
        'login': '/login',
        'admin': '/account?admin=sentientai'
      };

      const route = routeMap[destination];
      if (route) {
        window.location.assign(route);
        return {
          success: true,
          message: `Navigating to ${destination}...`,
          data: { destination, route }
        };
      }

      return {
        success: false,
        message: `Unknown destination: ${destination}. Try one of: ${Object.keys(routeMap).join(', ')}`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Navigation failed: ${error.message}`
      };
    }
  }

  private async openModule(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { module, platform } = params;

      window.dispatchEvent(new CustomEvent('openModule', {
        detail: { module, platform: platform || context.platform }
      }));

      return {
        success: true,
        message: `Opening ${module} module...`,
        data: { module, platform }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to open module: ${error.message}`
      };
    }
  }

  /**
   * SETTINGS OPERATIONS
   */
  private async updateSettings(params: any, _context: OperationContext): Promise<OperationResult> {
    try {
      const { setting, value, platform } = params;

      const storageKey = platform 
        ? `${platform}_${setting}` 
        : setting;

      localStorage.setItem(storageKey, value);

      return {
        success: true,
        message: `✅ Updated ${setting} to ${value}`,
        data: { setting, value, platform }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to update settings: ${error.message}`
      };
    }
  }

  /**
   * Helper: Parse schedule time from natural language
   */
  private parseScheduleTime(timeStr: string): Date {
    const now = new Date();
    const lowerTime = timeStr.toLowerCase();

    // Specific times (e.g., "3 PM", "15:00")
    const timeMatch = lowerTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const meridiem = timeMatch[3];

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      const targetDate = new Date(now);
      targetDate.setHours(hours, minutes, 0, 0);

      if (targetDate < now) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      return targetDate;
    }

    // "in X hours"
    const inMatch = lowerTime.match(/in\s+(\d+)\s+(hour|minute|day)/i);
    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const targetDate = new Date(now);

      if (unit.startsWith('hour')) targetDate.setHours(targetDate.getHours() + amount);
      else if (unit.startsWith('minute')) targetDate.setMinutes(targetDate.getMinutes() + amount);
      else if (unit.startsWith('day')) targetDate.setDate(targetDate.getDate() + amount);

      return targetDate;
    }

    // Default: 1 hour from now
    const defaultDate = new Date(now);
    defaultDate.setHours(defaultDate.getHours() + 1);
    return defaultDate;
  }
}

// Singleton instance
export const operationExecutor = new OperationExecutor();
