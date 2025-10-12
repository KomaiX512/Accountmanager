/**
 * Universal Operation Registry for AI Manager
 * Defines all operations that can be executed through natural language
 */

export interface OperationParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
  default?: any;
  items?: {
    type: string;
    description?: string;
  };
  properties?: Record<string, any>;
}

export interface OperationDefinition {
  id: string;
  name: string;
  description: string;
  category: 'platform' | 'content' | 'analytics' | 'settings' | 'navigation';
  parameters: OperationParameter[];
  requiresAuth: boolean;
  requiresPlatform: boolean;
  execute: (params: any, context: OperationContext) => Promise<OperationResult>;
}

export interface OperationContext {
  userId: string;
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  username?: string;
  currentPage?: string;
  authToken?: string;
}

export interface OperationResult {
  success: boolean;
  message: string;
  data?: any;
  nextSteps?: string[];
  requiresInput?: {
    field: string;
    prompt: string;
    type: string;
  };
}

/**
 * PLATFORM OPERATIONS
 */

export const ACQUIRE_PLATFORM: OperationDefinition = {
  id: 'acquire_platform',
  name: 'Acquire Platform',
  description: 'Acquire/connect a social media platform account (Instagram, Twitter, Facebook, LinkedIn)',
  category: 'platform',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'The platform to acquire',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'username',
      type: 'string',
      description: 'Primary username/account name',
      required: true
    },
    {
      name: 'competitors',
      type: 'array',
      description: 'List of at least 3 competitor usernames',
      required: true,
      items: {
        type: 'string',
        description: 'Competitor username'
      }
    },
    {
      name: 'accountType',
      type: 'string',
      description: 'Type of account',
      required: true,
      enum: ['personal', 'business', 'creator', 'brand']
    },
    {
      name: 'postingStyle',
      type: 'string',
      description: 'Preferred posting style',
      required: false,
      enum: ['professional', 'casual', 'humorous', 'inspirational', 'educational']
    }
  ],
  requiresAuth: true,
  requiresPlatform: false,
  execute: async (params, _context) => {
    // Implementation will call the actual platform acquisition API
    return {
      success: true,
      message: `Initiating ${params.platform} acquisition for @${params.username}. Processing will take approximately 15 minutes.`,
      data: { processingStatus: 'started' },
      nextSteps: [
        'Monitor processing status',
        'Wait for completion notification',
        'Access dashboard once processing completes'
      ]
    };
  }
};

export const CHECK_PLATFORM_STATUS: OperationDefinition = {
  id: 'check_platform_status',
  name: 'Check Platform Status',
  description: 'Check ONLY if platform is connected. Use ONLY when user explicitly asks is X connected, do I have X, am I connected to X, or what platforms do I have. DO NOT use for analytics, stats, or any numerical data.',
  category: 'platform',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'The platform to check',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    }
  ],
  requiresAuth: true,
  requiresPlatform: false,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Checking status for ${params.platform}...`,
      data: { status: 'connected', processingComplete: true }
    };
  }
};

/**
 * CONTENT OPERATIONS
 */

export const CREATE_POST: OperationDefinition = {
  id: 'create_post',
  name: 'Create Post',
  description: 'Create a new post with AI. Use when user asks to create, make, write, generate, or post content. This actually creates and generates social media content with captions and optionally images.',
  category: 'content',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform for the post',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'prompt',
      type: 'string',
      description: 'What the post should be about (optional - if not provided, will create general engaging content)',
      required: false,
      default: 'Create an engaging post about recent trends'
    },
    {
      name: 'includeImage',
      type: 'boolean',
      description: 'Whether to include an AI-generated image',
      required: false,
      default: true
    },
    {
      name: 'tone',
      type: 'string',
      description: 'Tone of the post',
      required: false,
      enum: ['professional', 'casual', 'humorous', 'inspirational', 'educational'],
      default: 'professional'
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Creating ${params.platform} post about: ${params.prompt}`,
      data: { postId: 'generated-id', status: 'created' }
    };
  }
};

export const CREATE_POST_FROM_NEWS: OperationDefinition = {
  id: 'create_post_from_news',
  name: 'Create Post from News',
  description: 'Create a post based on trending news items',
  category: 'content',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'newsIndex',
      type: 'number',
      description: 'Index of news item to use (0 for latest)',
      required: false,
      default: 0
    },
    {
      name: 'customization',
      type: 'string',
      description: 'Additional customization instructions',
      required: false
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Creating post from news item #${params.newsIndex} for ${params.platform}`,
      data: { postId: 'news-post-id' }
    };
  }
};

export const SCHEDULE_POST: OperationDefinition = {
  id: 'schedule_post',
  name: 'Schedule Post',
  description: 'Schedule a post for future publishing',
  category: 'content',
  parameters: [
    {
      name: 'postId',
      type: 'string',
      description: 'ID of the post to schedule',
      required: true
    },
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'scheduledTime',
      type: 'string',
      description: 'When to publish (natural language or ISO format)',
      required: true
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Post scheduled for ${params.scheduledTime}`,
      data: { scheduledTime: params.scheduledTime }
    };
  }
};

export const AUTO_SCHEDULE_POSTS: OperationDefinition = {
  id: 'auto_schedule_posts',
  name: 'Auto-Schedule Multiple Posts',
  description: 'Automatically schedule multiple posts with optimal timing',
  category: 'content',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Target platform',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'numberOfPosts',
      type: 'number',
      description: 'Number of posts to schedule',
      required: false,
      default: 5
    },
    {
      name: 'intervalHours',
      type: 'number',
      description: 'Hours between each post',
      required: false,
      default: 24
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Auto-scheduling ${params.numberOfPosts} posts with ${params.intervalHours}h intervals`,
      data: { scheduledCount: params.numberOfPosts }
    };
  }
};

/**
 * ANALYTICS OPERATIONS
 */

export const GET_ANALYTICS: OperationDefinition = {
  id: 'get_analytics',
  name: 'Get Analytics',
  description: 'Get NUMBERS: follower count, post count, engagement rate, likes, comments, reach. Use this when user asks for stats, metrics, analytics, or any numerical data about their account performance.',
  category: 'analytics',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Platform to get analytics for',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin', 'all']
    },
    {
      name: 'metric',
      type: 'string',
      description: 'Specific metric to retrieve',
      required: false,
      enum: ['engagement', 'followers', 'reach', 'posts', 'overall']
    },
    {
      name: 'timeRange',
      type: 'string',
      description: 'Time range for analytics',
      required: false,
      enum: ['7d', '30d', '90d', 'all'],
      default: '30d'
    }
  ],
  requiresAuth: true,
  requiresPlatform: false,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Retrieving ${params.metric || 'all'} analytics for ${params.platform}`,
      data: { metrics: {}, timeRange: params.timeRange }
    };
  }
};

export const GET_COMPETITOR_ANALYSIS: OperationDefinition = {
  id: 'get_competitor_analysis',
  name: 'Get Competitor Analysis',
  description: 'Analyze competitors with AI-powered insights, strategies, and recommendations. Use when user asks about competitors, competition, comparing to other accounts, or wants strategic advice. Returns detailed analysis with actionable insights, NOT just numbers.',
  category: 'analytics',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Platform for competitor analysis',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'competitors',
      type: 'array',
      description: 'Specific competitors to analyze',
      required: false,
      items: {
        type: 'string',
        description: 'Competitor username'
      }
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Analyzing competitors on ${params.platform}`,
      data: { analysis: {} }
    };
  }
};

export const GET_STATUS: OperationDefinition = {
  id: 'get_status',
  name: 'Get Status',
  description: 'Get overview of connected platforms with follower counts, post counts, and connection status',
  category: 'analytics',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Specific platform to check (optional, defaults to all connected platforms)',
      required: false,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    }
  ],
  requiresAuth: true,
  requiresPlatform: false,
  execute: async (_params, _context) => {
    return {
      success: true,
      message: 'Getting your status...',
      data: {}
    };
  }
};

export const GET_NEWS_SUMMARY: OperationDefinition = {
  id: 'get_news_summary',
  name: 'Get News Summary',
  description: 'Get trending news with AI summary. Use when user asks about trending topics, what is hot, latest news, what is happening, or current trends on the platform.',
  category: 'analytics',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Platform to get trending news for',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Number of news items to display',
      required: false,
      default: 4
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (_params, _context) => {
    return {
      success: true,
      message: 'Fetching trending news...',
      data: {}
    };
  }
};

export const GET_STRATEGIES: OperationDefinition = {
  id: 'get_strategies',
  name: 'Get Strategies',
  description: 'Retrieve recommended strategies and action items for a platform',
  category: 'analytics',
  parameters: [
    {
      name: 'platform',
      type: 'string',
      description: 'Platform to get strategies for',
      required: true,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Number of strategies to display',
      required: false,
      default: 5
    }
  ],
  requiresAuth: true,
  requiresPlatform: true,
  execute: async (_params, _context) => {
    return {
      success: true,
      message: 'Fetching strategies...',
      data: {}
    };
  }
};

/**
 * NAVIGATION OPERATIONS
 */

export const NAVIGATE_TO: OperationDefinition = {
  id: 'navigate_to',
  name: 'Navigate To',
  description: 'Navigate to different dashboards and pages in the application',
  category: 'navigation',
  parameters: [
    {
      name: 'destination',
      type: 'string',
      description: 'The destination to navigate to',
      required: true,
      enum: [
        'main-dashboard', 
        'instagram', 
        'twitter', 
        'facebook', 
        'linkedin', 
        'pricing',
        'home',
        'homepage',
        'privacy',
        'login',
        'admin'
      ]
    },
    {
      name: 'subSection',
      type: 'string',
      description: 'Specific section within the page',
      required: false
    }
  ],
  requiresAuth: false,
  requiresPlatform: false,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Navigating to ${params.destination}`,
      data: { route: params.destination }
    };
  }
};

export const OPEN_MODULE: OperationDefinition = {
  id: 'open_module',
  name: 'Open Module',
  description: 'Open a specific dashboard module',
  category: 'navigation',
  parameters: [
    {
      name: 'module',
      type: 'string',
      description: 'Module to open',
      required: true,
      enum: ['notifications', 'posts', 'strategies', 'competitor-analysis', 'news', 'chat', 'dms']
    },
    {
      name: 'platform',
      type: 'string',
      description: 'Platform context',
      required: false,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    }
  ],
  requiresAuth: true,
  requiresPlatform: false,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Opening ${params.module} module`,
      data: { module: params.module }
    };
  }
};

/**
 * SETTINGS OPERATIONS
 */

export const UPDATE_SETTINGS: OperationDefinition = {
  id: 'update_settings',
  name: 'Update Settings',
  description: 'Update application or platform settings',
  category: 'settings',
  parameters: [
    {
      name: 'setting',
      type: 'string',
      description: 'Setting to update',
      required: true
    },
    {
      name: 'value',
      type: 'string',
      description: 'New value',
      required: true
    },
    {
      name: 'platform',
      type: 'string',
      description: 'Platform-specific setting',
      required: false,
      enum: ['instagram', 'twitter', 'facebook', 'linkedin']
    }
  ],
  requiresAuth: true,
  requiresPlatform: false,
  execute: async (params, _context) => {
    return {
      success: true,
      message: `Updated ${params.setting} to ${params.value}`,
      data: { setting: params.setting, value: params.value }
    };
  }
};

/**
 * Operation Registry - Central registry of all operations
 */
export class OperationRegistry {
  private operations: Map<string, OperationDefinition> = new Map();

  constructor() {
    this.registerDefaultOperations();
  }

  private registerDefaultOperations() {
    // Platform operations
    this.register(ACQUIRE_PLATFORM);
    this.register(CHECK_PLATFORM_STATUS);

    // Content operations
    this.register(CREATE_POST);
    this.register(CREATE_POST_FROM_NEWS);
    this.register(SCHEDULE_POST);
    this.register(AUTO_SCHEDULE_POSTS);

    // Analytics operations
    this.register(GET_ANALYTICS);
    this.register(GET_COMPETITOR_ANALYSIS);
    this.register(GET_STATUS);
    this.register(GET_NEWS_SUMMARY);
    this.register(GET_STRATEGIES);

    // Navigation operations
    this.register(NAVIGATE_TO);
    this.register(OPEN_MODULE);

    // Settings operations
    this.register(UPDATE_SETTINGS);
  }

  register(operation: OperationDefinition) {
    this.operations.set(operation.id, operation);
  }

  get(operationId: string): OperationDefinition | undefined {
    return this.operations.get(operationId);
  }

  getAll(): OperationDefinition[] {
    return Array.from(this.operations.values());
  }

  getByCategory(category: string): OperationDefinition[] {
    return this.getAll().filter(op => op.category === category);
  }

  /**
   * Convert operations to Gemini function declarations format
   */
  toGeminiFunctionDeclarations(): any[] {
    return this.getAll().map(op => ({
      name: op.id,
      description: op.description,
      parameters: {
        type: 'object',
        properties: op.parameters.reduce((acc, param) => {
          acc[param.name] = {
            type: param.type,
            description: param.description,
            ...(param.enum ? { enum: param.enum } : {}),
            ...(param.type === 'array' && param.items ? { items: param.items } : {}),
            ...(param.type === 'object' && param.properties ? { properties: param.properties } : {})
          };
          return acc;
        }, {} as any),
        required: op.parameters.filter(p => p.required).map(p => p.name)
      }
    }));
  }
}

// Singleton instance
export const operationRegistry = new OperationRegistry();
