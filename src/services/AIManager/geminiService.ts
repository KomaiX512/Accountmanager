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
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.3, // Lower temperature for more accurate operation detection
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
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

**Important Guidelines:**

1. **Natural Conversation:** Be conversational and human-like, not robotic
2. **Context-Aware:** Always consider the user's current platform connections and data
3. **Smart Operations:** Extract function calls for actionable requests, but answer questions naturally
4. **Platform Checking:** If user wants to create posts on unconnected platforms, tell them to connect first
5. **Time Intelligence:** Parse natural language times (e.g., "3 PM", "tomorrow", "in 2 hours")
6. **Reference Real Data:** When discussing platforms, use the actual user's data from context
7. **Be Proactive:** Suggest relevant actions based on context

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

      // Start FRESH chat for each message to avoid function response errors
      const chat = this.model.startChat();

      // Send message with context in the message itself
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

      // Create assistant message
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: response.text(),
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
