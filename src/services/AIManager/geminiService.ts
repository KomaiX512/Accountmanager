/**
 * Gemini AI Service with Function Calling
 * Handles natural language processing and operation extraction
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { operationRegistry, OperationContext } from './operationRegistry';
import { contextService, UserContext } from './contextService';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  operationCalls?: OperationCall[];
}

export interface OperationCall {
  operationId: string;
  parameters: any;
  result?: any;
  error?: string;
}

export interface ConversationContext {
  userId: string;
  platform?: string;
  username?: string;
  currentPage?: string;
  conversationHistory: AIMessage[];
  pendingOperations: OperationCall[];
}

export class GeminiAIService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private conversationHistory: Map<string, ConversationContext> = new Map();
  private userContext: UserContext | null = null;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async initialize(userId: string) {
    // Fetch user context
    this.userContext = await contextService.getUserContext(userId);
    this.initializeModel();
  }
  private initializeModel() {
    // Get function declarations from operation registry
    const functions = operationRegistry.toGeminiFunctionDeclarations();

    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3, // Lower temperature for more deterministic function calling
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        candidateCount: 1,
        stopSequences: []
      },
      systemInstruction: this.generateSystemInstruction(),
      tools: [{ functionDeclarations: functions }]
    });

    console.log('🤖 Gemini AI Manager initialized with', functions.length, 'operations');
  }

  /**
   * Generate dynamic system instruction based on user context
   */
  private generateSystemInstruction(): string {
    const baseInstruction = `You are an AI Manager for Sentient Marketing, a social media management platform.

Your role is to help users perform operations through natural language commands AND answer general questions conversationally.

${this.userContext ? contextService.formatContextForAI(this.userContext) : ''}

**Your Capabilities:**

1. **Platform Operations:**
   - Acquire/connect social media platforms (Instagram, Twitter, Facebook, LinkedIn)
   - Check platform connection status

2. **Content Creation:**
   - Create posts with AI assistance using RAG (Retrieval Augmented Generation)
   - Generate posts from trending news
   - Schedule posts for specific times
   - Auto-schedule multiple posts with intervals

3. **Analytics & Insights:**
   - Get performance metrics and analytics
   - Analyze competitor strategies
   - Provide insights based on user's platform data

4. **Navigation:**
   - Navigate to any page in the application
   - Open specific modules and sections

5. **General Conversation:**
   - Answer questions about time, calculations, and general topics
   - Explain your own architecture and capabilities
   - Provide help and guidance

**FUNCTION CALLING DECISION TREE:**

When user asks about NUMBERS (followers, posts, likes, engagement):
→ Call get_analytics

When user asks about COMPETITORS (analyze, compare, strategy):
→ Call get_competitor_analysis

When user asks about NEWS or TRENDS (what's hot, trending, latest):
→ Call get_news_summary

When user asks to CREATE/MAKE/WRITE CONTENT:
→ Call create_post

When user asks "IS X CONNECTED?" or "DO I HAVE X?":
→ Call check_platform_status

**CRITICAL: MULTIPLE OPERATIONS IN ONE QUERY**

When user requests MULTIPLE actions, you MUST call ALL relevant functions:

Example 1:
User: "Show me my stats and create a post"
→ Call get_analytics AND create_post (2 functions)

Example 2:
User: "Get my analytics, analyze competitors, and show trending news"
→ Call get_analytics AND get_competitor_analysis AND get_news_summary (3 functions)

Example 3:
User: "Check my Instagram status, analyze my top competitor, get trending news, and create a post"
→ Call check_platform_status AND get_competitor_analysis AND get_news_summary AND create_post (4 functions)

**MANDATORY:** If user asks for 2+ actions, you MUST call ALL functions. Never skip operations.

**Important Guidelines:**

1. **Natural Conversation:** Be conversational and human-like, not robotic
2. **Context-Aware:** Always consider the user's current platform connections and data
3. **Smart Operations:** Extract function calls for actionable requests, but answer questions naturally
4. **Platform Checking:** If user wants to create posts on unconnected platforms, tell them to connect first
5. **Time Intelligence:** Parse natural language times (e.g., "3 PM", "tomorrow", "in 2 hours")
6. **Reference Real Data:** When discussing platforms, use the actual user's data from context
7. **Be Proactive:** Suggest relevant actions based on context

**CRITICAL: NEVER RETURN EMPTY RESPONSES**

When calling functions, you MUST ALWAYS provide explanatory text in your response. Follow this pattern:

1. **Before the function call:** Explain what you're about to do
   Example: "Let me fetch your Twitter analytics for you..."

2. **After the function call:** Explain what the user should expect
   Example: "This will give you insights into your engagement and performance!"

3. **NEVER** return just a function call without ANY text
   ❌ WRONG: [function call only, no text]
   ✅ CORRECT: "Let me pull that up for you! [function call] I'll have those results in just a moment."

**Examples of REQUIRED Function Call Wrapping:**

User: "Get my Instagram analytics"
❌ BAD: [calls getAnalytics silently]
✅ GOOD: "Absolutely! Let me retrieve your Instagram analytics for you. 📊 [calls getAnalytics] This will show you engagement rates, follower growth, and post performance!"

User: "Navigate to Twitter"
❌ BAD: [calls navigate silently]
✅ GOOD: "Sure thing! Taking you to your Twitter dashboard now. [calls navigate] You'll be able to manage your tweets and view your timeline there!"

**MANDATORY:** Every single function call must be wrapped with explanatory text. This is non-negotiable.

**Response Style:**
- Professional but friendly and lively
- Use emojis naturally (✅ ❌ 🔥 📊 🎯 💪)
- Keep responses concise but informative
- Show personality - be engaging and helpful
- When users greet you, greet them back warmly

**Examples of Natural Responses:**

User: "What platforms do I have?"
You: "You have Instagram connected as @maccosmetics! 🎉 Would you like to connect more platforms?"

User: "What time is it in 15 minutes?"
You: "In 15 minutes, it will be [calculated time]. ⏰"

User: "How do you work?"
You: "I'm powered by Google's Gemini AI and integrated with your platform data through RAG (Retrieval Augmented Generation). I can help you manage your social media, create posts, analyze competitors, and more! 🤖"

Remember: Be natural, be helpful, be lively!`;

    return baseInstruction;
  }

  /**
   * Process user message and extract operations
   */
  async processMessage(
    userId: string,
    message: string,
    context: Partial<OperationContext>
  ): Promise<AIMessage> {
    try {
      // CRITICAL: Refresh user context on EACH message
      this.userContext = await contextService.getUserContext(userId);
      if (context.username) {
        this.userContext.username = context.username;
      }
      
      console.log('🔄 [Gemini] Refreshed context for message:', {
        username: this.userContext.username,
        platforms: this.userContext.platforms.filter(p => p.connected).length
      });
      
      // Reinitialize model with current context
      this.initializeModel();
      
      // Get or create conversation context
      const conversationContext = this.getConversationContext(userId, context);
      
      // Add user message to history
      const userMessage: AIMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      conversationContext.conversationHistory.push(userMessage);

      // Convert conversation history to Gemini format
      const geminiHistory = conversationContext.conversationHistory
        .slice(0, -1) // Exclude current message
        .filter(msg => msg.role !== 'system') // Only user and assistant
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

      console.log(`💬 [Gemini] Using conversation history: ${geminiHistory.length} messages`);

      // Start chat WITH conversation history
      const chat = this.model.startChat({
        history: geminiHistory
      });

      // Send message with current context
      const contextAwareMessage = `User context: ${this.userContext.username}, platforms: ${this.userContext.platforms.filter(p => p.connected).map(p => p.name).join(', ')}\n\nUser query: ${message}`;
      
      const result = await chat.sendMessage(contextAwareMessage);
      const response = result.response;

      // Check for function calls
      const functionCalls = response.functionCalls();
      const operationCalls: OperationCall[] = [];

      if (functionCalls && functionCalls.length > 0) {
        console.log('🔧 Function calls detected:', functionCalls.length);

        for (const call of functionCalls) {
          operationCalls.push({
            operationId: call.name,
            parameters: call.args
          });
        }
      }

      // Get response text
      let responseText = response.text() || '';

      // SAFETY NET: If Gemini returned empty text but called functions, inject explanatory text
      if ((!responseText || responseText.trim() === '') && operationCalls.length > 0) {
        console.warn('⚠️ [Gemini] Empty response with function calls detected - injecting explanatory text');
        
        // Generate friendly explanatory text based on operation
        const operation = operationCalls[0];
        const explanations: Record<string, string> = {
          'get_analytics': '📊 Let me pull up your analytics for you! This will show your performance metrics and insights.',
          'get_competitor_analysis': '🔍 Analyzing your competitors now! I\'ll provide insights into their strategies and performance.',
          'create_post': '✍️ Creating your post now! I\'ll generate something great based on your platform style.',
          'navigate_to': '🚀 Taking you there now!',
          'get_news_summary': '📰 Fetching the latest trending news for you!',
          'get_strategies': '💡 Let me retrieve your recommended strategies!',
          'check_platform_status': '🔍 Checking your platform status now!',
          'schedule_post': '📅 Scheduling your post!',
          'acquire_platform': '🎉 Starting the platform acquisition process!',
          'open_module': '📂 Opening that module for you!',
          'get_status': '📊 Getting your account status!'
        };
        
        responseText = explanations[operation.operationId] || 
          `🤖 Processing your request: ${operation.operationId.replace(/_/g, ' ')}...`;
      }

      // Create assistant message
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        operationCalls
      };

      conversationContext.conversationHistory.push(assistantMessage);
      conversationContext.pendingOperations.push(...operationCalls);

      return assistantMessage;

    } catch (error: any) {
      console.error('❌ Gemini processing error:', error);
      
      return {
        role: 'assistant',
        content: `I encountered an error processing your request: ${error.message}. Please try rephrasing your command.`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get or create conversation context
   */
  private getConversationContext(
    userId: string,
    context: Partial<OperationContext>
  ): ConversationContext {
    let conv = this.conversationHistory.get(userId);
    
    if (!conv) {
      conv = {
        userId,
        platform: context.platform,
        username: context.username,
        currentPage: context.currentPage,
        conversationHistory: [],
        pendingOperations: []
      };
      this.conversationHistory.set(userId, conv);
    } else {
      // Update context
      if (context.platform) conv.platform = context.platform;
      if (context.username) conv.username = context.username;
      if (context.currentPage) conv.currentPage = context.currentPage;
    }

    return conv;
  }

  /**
   * Build chat history for Gemini
   */
  private buildChatHistory(context: ConversationContext): any[] {
    const history: any[] = [];

    for (const msg of context.conversationHistory) {
      if (msg.role === 'user') {
        history.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [{ text: msg.content }];
        
        // Add function call results if available
        if (msg.operationCalls) {
          for (const call of msg.operationCalls) {
            if (call.result) {
              parts.push({
                functionResponse: {
                  name: call.operationId,
                  response: call.result
                }
              });
            }
          }
        }

        history.push({
          role: 'model',
          parts
        });
      }
    }

    return history;
  }

  /**
   * Clear conversation history
   */
  clearHistory(userId: string) {
    this.conversationHistory.delete(userId);
  }

  /**
   * Clear all conversation history (for delete button)
   */
  clearConversation() {
    this.conversationHistory.clear();
    console.log('🗑️ [Gemini] All conversation history cleared');
  }

  /**
   * Get conversation history
   */
  getHistory(userId: string): AIMessage[] {
    const context = this.conversationHistory.get(userId);
    return context?.conversationHistory || [];
  }

  /**
   * Update operation result in conversation
   */
  updateOperationResult(
    userId: string,
    operationId: string,
    result: any,
    error?: string
  ) {
    const context = this.conversationHistory.get(userId);
    if (!context) return;

    // Find the operation in pending operations
    const opIndex = context.pendingOperations.findIndex(
      op => op.operationId === operationId && !op.result && !op.error
    );

    if (opIndex !== -1) {
      context.pendingOperations[opIndex].result = result;
      context.pendingOperations[opIndex].error = error;
    }

    // Also update in conversation history
    for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
      const msg = context.conversationHistory[i];
      if (msg.operationCalls) {
        const callIndex = msg.operationCalls.findIndex(
          call => call.operationId === operationId && !call.result && !call.error
        );
        if (callIndex !== -1) {
          msg.operationCalls[callIndex].result = result;
          msg.operationCalls[callIndex].error = error;
          break;
        }
      }
    }
  }

  /**
   * Parse natural language time to Date object
   */
  static parseNaturalTime(timeStr: string): Date {
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

      // If time has passed today, schedule for tomorrow
      if (targetDate < now) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      return targetDate;
    }

    // Relative times
    if (lowerTime.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
      return tomorrow;
    }

    if (lowerTime.includes('next week')) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(9, 0, 0, 0);
      return nextWeek;
    }

    // "in X hours/minutes"
    const inMatch = lowerTime.match(/in\s+(\d+)\s+(hour|minute|day)/i);
    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const targetDate = new Date(now);

      if (unit.startsWith('hour')) {
        targetDate.setHours(targetDate.getHours() + amount);
      } else if (unit.startsWith('minute')) {
        targetDate.setMinutes(targetDate.getMinutes() + amount);
      } else if (unit.startsWith('day')) {
        targetDate.setDate(targetDate.getDate() + amount);
      }

      return targetDate;
    }

    // Default: 1 hour from now
    const defaultDate = new Date(now);
    defaultDate.setHours(defaultDate.getHours() + 1);
    return defaultDate;
  }
}

// Singleton instance (will be initialized with API key)
let geminiServiceInstance: GeminiAIService | null = null;

export function initializeGeminiService(apiKey: string): void {
  geminiServiceInstance = new GeminiAIService(apiKey);
  console.log('🤖 Gemini Service initialized');
}

export function getGeminiService(): GeminiAIService | null {
  return geminiServiceInstance;
};
