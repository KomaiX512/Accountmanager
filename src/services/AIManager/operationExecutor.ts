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
      // Check localStorage first
      const localCheck = localStorage.getItem(`${platform}_accessed_${userId}`);
      if (localCheck === 'true') {
        const username = localStorage.getItem(`${platform}_username_${userId}`);
        return !!username;
      }

      // Check backend
      const response = await axios.get(getApiUrl(`/api/platform-connection/${platform}/${userId}`));
      return response.data.connected === true;
    } catch (error) {
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

      // Store competitors
      if (competitors && Array.isArray(competitors)) {
        localStorage.setItem(`${platform}_competitors`, JSON.stringify(competitors));
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
      
      const response = await axios.get(
        getApiUrl(`/api/platform-connection/${platform}/${context.userId}`)
      );

      const isConnected = response.data.connected;
      const username = response.data.username;

      return {
        success: true,
        message: isConnected 
          ? `✅ ${platform} is connected (@${username})`
          : `❌ ${platform} is not connected`,
        data: {
          platform,
          connected: isConnected,
          username
        }
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
   * CONTENT OPERATIONS
   */
  private async createPost(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, prompt, includeImage, tone } = params;
      
      // Get username from context or localStorage
      const targetPlatform = platform || context.platform || 'instagram';
      let username = context.username;
      if (!username && context.userId) {
        username = localStorage.getItem(`${targetPlatform}_username_${context.userId}`) || 
                   localStorage.getItem('accountHolder') || 
                   'user';
      }

      console.log('🎨 [CreatePost] Calling RAG with:', {
        platform: targetPlatform,
        username,
        query: prompt
      });

      // Call RAG endpoint to generate post (RAG expects "query" not "prompt")
      const response = await axios.post(getApiUrl('/api/post-generator'), {
        platform: targetPlatform,
        username: username,
        query: `Create a ${tone || 'professional'} ${targetPlatform} post about: ${prompt}${includeImage !== false ? '. Include visual elements.' : ''}`
      });

      // Dispatch event to refresh PostCooked module
      window.dispatchEvent(new CustomEvent('newPostCreated'));

      return {
        success: true,
        message: `✅ Post created successfully! Check your "Posts" module to view, edit, or schedule it.`,
        data: {
          postId: response.data.postId || 'generated',
          platform: platform || context.platform
        },
        nextSteps: [
          'View the post in the "Cooked Posts" module',
          'Schedule it for publishing',
          'Edit if needed'
        ]
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to create post: ${error.message}`
      };
    }
  }

  private async createPostFromNews(params: any, context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, newsIndex, customization } = params;
      const targetPlatform = platform || context.platform;

      // Fetch news items
      const newsResponse = await axios.get(
        getApiUrl(`/api/news-for-you/${context.username}?platform=${targetPlatform}`)
      );

      const newsItems = newsResponse.data;
      if (!newsItems || newsItems.length === 0) {
        return {
          success: false,
          message: 'No news items available. Please try again later.'
        };
      }

      const newsItem = newsItems[newsIndex || 0];
      if (!newsItem) {
        return {
          success: false,
          message: `News item at index ${newsIndex} not found`
        };
      }

      // Create post from news
      const postQuery = `Create an engaging infographic post about this news: ${newsItem.title}. ${newsItem.content || ''}${customization ? ` Additional instructions: ${customization}` : ''}`;
      
      // Get username
      let username = context.username;
      if (!username && context.userId) {
        username = localStorage.getItem(`${targetPlatform}_username_${context.userId}`) || 
                   localStorage.getItem('accountHolder') || 
                   'user';
      }

      const response = await axios.post(getApiUrl('/api/post-generator'), {
        platform: targetPlatform,
        username: username,
        query: postQuery
      });

      window.dispatchEvent(new CustomEvent('newPostCreated'));

      return {
        success: true,
        message: `✅ Post created from news: "${newsItem.title}". Check your "Posts" module!`,
        data: {
          postId: response.data.postId || 'generated',
          newsTitle: newsItem.title
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to create post from news: ${error.message}`
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
  private async getAnalytics(params: any, _context: OperationContext): Promise<OperationResult> {
    try {
      const { platform, metric, timeRange } = params;

      // Navigate to appropriate analytics view
      if (platform === 'all') {
        window.location.assign('/usage');
      } else {
        window.location.assign(`/dashboard/${platform}`);
      }

      return {
        success: true,
        message: `📊 Opening ${metric || 'analytics'} for ${platform}...`,
        data: { platform, metric, timeRange }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to retrieve analytics: ${error.message}`
      };
    }
  }

  private async getCompetitorAnalysis(params: any, _context: OperationContext): Promise<OperationResult> {
    try {
      const { platform } = params;
      
      // Open competitor analysis module
      window.dispatchEvent(new CustomEvent('openModule', {
        detail: { module: 'competitor-analysis', platform }
      }));

      return {
        success: true,
        message: `📊 Opening competitor analysis for ${platform}...`,
        data: { platform }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to retrieve competitor analysis: ${error.message}`
      };
    }
  }

  /**
   * NAVIGATION OPERATIONS
   */
  private async navigateTo(params: any, _context: OperationContext): Promise<OperationResult> {
    try {
      const { destination } = params;

      const routeMap: Record<string, string> = {
        'main-dashboard': '/main',
        'instagram': '/dashboard/instagram',
        'twitter': '/dashboard/twitter',
        'facebook': '/dashboard/facebook',
        'linkedin': '/dashboard/linkedin',
        'usage': '/usage',
        'admin': '/admin',
        'settings': '/settings',
        'pricing': '/pricing',
        'home': '/',
        'homepage': '/',
        'privacy': '/privacy-policy',
        'privacy-policy': '/privacy-policy',
        'terms': '/terms-of-service',
        'terms-of-service': '/terms-of-service',
        'about': '/about',
        'contact': '/contact',
        'help': '/help',
        'support': '/support',
        'login': '/login',
        'signup': '/signup'
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
        message: `Unknown destination: ${destination}`
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
