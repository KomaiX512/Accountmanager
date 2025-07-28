import React from 'react';

export interface DecodedSection {
  heading: string;
  content: React.ReactElement[];
  level: number;
  type: 'heading' | 'subheading' | 'content' | 'list' | 'bullet' | 'paragraph' | 'quote' | 'emphasis';
}

export interface DecodingOptions {
  preserveLineBreaks?: boolean;
  enableBoldFormatting?: boolean;
  enableItalicFormatting?: boolean;
  enableHighlighting?: boolean;
  enableQuotes?: boolean;
  enableEmphasis?: boolean;
  maxNestingLevel?: number;
  customClassPrefix?: string;
  preserveJSONStructure?: boolean;
  smartParagraphDetection?: boolean;
  skipDecodingForElements?: string[]; // Elements to skip decoding
  enableDebugLogging?: boolean; // ✅ NEW: Enable detailed logging for troubleshooting
}

interface Token {
  type: 'text' | 'quote' | 'comma' | 'brace' | 'bracket' | 'colon' | 'semicolon' | 'period' | 'newline' | 'emphasis' | 'bold' | 'highlight' | 'key' | 'value';
  value: string;
  position: number;
  formatting?: 'bold' | 'italic' | 'highlight' | 'quote' | 'emphasis';
}

class AdvancedJSONDecoder {
  private options: DecodingOptions;
  private elementCounter: number = 0;
  private tokenCache: Map<string, Token[]> = new Map();

  constructor(options: DecodingOptions = {}) {
    this.options = {
      preserveLineBreaks: true,
      enableBoldFormatting: true,
      enableItalicFormatting: true,
      enableHighlighting: true,
      enableQuotes: true,
      enableEmphasis: true,
      maxNestingLevel: 5,
      customClassPrefix: 'decoded',
      preserveJSONStructure: true,
      smartParagraphDetection: true,
      skipDecodingForElements: [], // Initialize with empty array
      enableDebugLogging: false, // ✅ NEW: Debug logging disabled by default
      ...options
    };
  }

  /**
   * Main decoding function that processes any JSON structure with advanced formatting
   */
  public decodeJSON(data: any, level: number = 0): DecodedSection[] {
    if (this.options.enableDebugLogging) {
      console.log(`[JSONDecoder] Level ${level}: Processing data type: ${typeof data}`, data);
    }
    
    if (!data) {
      if (this.options.enableDebugLogging) {
        console.log(`[JSONDecoder] Level ${level}: Data is falsy, returning empty array`);
      }
      return [];
    }

    // Check nesting level to prevent infinite recursion
    if (level > this.options.maxNestingLevel!) {
      if (this.options.enableDebugLogging) {
        console.log(`[JSONDecoder] Level ${level}: Max nesting level reached, creating raw JSON element`);
      }
      return [{
        heading: 'Deep Nested Content',
        content: [this.createRawJSONElement(data, level)],
        level: level,
        type: 'content'
      }];
    }

    let result: DecodedSection[] = [];

    // Handle different data types with sophisticated processing
    if (typeof data === 'string') {
      result = this.decodeStringWithAdvancedFormatting(data, level);
    } else if (Array.isArray(data)) {
      result = this.decodeArrayWithStructure(data, level);
    } else if (typeof data === 'object') {
      result = this.decodeObjectWithStructure(data, level);
    } else {
      result = this.decodePrimitiveWithFormatting(data, level);
    }

    if (this.options.enableDebugLogging) {
      console.log(`[JSONDecoder] Level ${level}: Generated ${result.length} sections`);
    }

    return result;
  }

  /**
   * Advanced string decoding with sophisticated text analysis
   */
  private decodeStringWithAdvancedFormatting(text: string, level: number): DecodedSection[] {
    if (!text || typeof text !== 'string') {
      if (this.options.enableDebugLogging) {
        console.log(`[JSONDecoder] String decoding: Empty or non-string input`);
      }
      return [];
    }

    if (this.options.enableDebugLogging) {
      console.log(`[JSONDecoder] String decoding: Processing text of length ${text.length}`);
    }

    // ✅ NEW: Check if string contains nested JSON that should be parsed
    if (this.looksLikeNestedJSON(text)) {
      if (this.options.enableDebugLogging) {
        console.log(`[JSONDecoder] String contains nested JSON, attempting to parse`);
      }
      try {
        // First try direct parsing
        const parsedData = JSON.parse(text);
        return this.decodeJSON(parsedData, level);
      } catch (e) {
        // If direct parsing fails, try unescaping first
        try {
          const unescapedText = text
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');
          const parsedData = JSON.parse(unescapedText);
          return this.decodeJSON(parsedData, level);
        } catch (e2) {
          if (this.options.enableDebugLogging) {
            console.log(`[JSONDecoder] JSON parsing failed, proceeding with text decoding`, e2);
          }
          // Fall through to normal text processing
        }
      }
    }

    // Generate cache key for performance
    const cacheKey = `${text}_${level}_${JSON.stringify(this.options)}`;
    if (this.tokenCache.has(cacheKey)) {
      return this.processCachedTokens(this.tokenCache.get(cacheKey)!, level);
    }

    // Step 1: Advanced JSON artifact cleaning while preserving structure
    const cleanedText = this.advancedJSONCleaning(text);
    
    // Step 2: Tokenize the text with sophisticated parsing
    const tokens = this.tokenizeText(cleanedText);
    
    // Cache the tokens
    this.tokenCache.set(cacheKey, tokens);
    
    // Step 3: Process tokens into structured content
    const result = this.processTokensIntoStructuredContent(tokens, level);
    
    if (this.options.enableDebugLogging) {
      console.log(`[JSONDecoder] String decoding: Generated ${result.length} sections from text`);
    }
    
    return result;
  }

  /**
   * Detect if a string looks like it contains nested JSON data
   */
  private looksLikeNestedJSON(text: string): boolean {
    const trimmed = text.trim();
    
    // Check for JSON object or array structure
    const hasJSONStructure = (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) && trimmed.length > 2;
    
    // Also check for JSON-like patterns with escaped quotes
    const hasEscapedJSON = trimmed.includes('\\"') || trimmed.includes('{"') || trimmed.includes('["');
    
    // Check for comma-separated key-value patterns that might be stringified JSON
    const hasKeyValuePattern = /\\"[^"]+\\":\s*[\[\{"]/.test(trimmed);
    
    return hasJSONStructure || hasEscapedJSON || hasKeyValuePattern;
  }

  /**
   * Advanced JSON cleaning that preserves meaningful structure
   */
  private advancedJSONCleaning(text: string): string {
    return text
      // Preserve meaningful JSON structure while cleaning artifacts
      .replace(/\\"/g, '"') // Unescape quotes
      .replace(/\\'/g, "'") // Unescape single quotes
      .replace(/\\\\/g, '\\') // Unescape backslashes
      .replace(/\\n/g, '\n') // Convert newline escapes
      .replace(/\\t/g, '\t') // Convert tab escapes
      .replace(/\\r/g, '\r') // Convert carriage return escapes
      
      // ✅ NEW: Handle complex JSON patterns that might be embedded
      .replace(/"\s*\{\s*"/g, '{"') // Fix spaced JSON object starts
      .replace(/"\s*\}\s*"/g, '"}') // Fix spaced JSON object ends
      .replace(/"\s*\[\s*"/g, '["') // Fix spaced JSON array starts
      .replace(/"\s*\]\s*"/g, '"]') // Fix spaced JSON array ends
      
      // Smart cleaning of JSON structural elements
      .replace(/\s*\{\s*/g, (match) => {
        // Preserve spacing around braces for readability
        return match.trim() === '{' ? ' ' : match;
      })
      .replace(/\s*\}\s*/g, (match) => {
        return match.trim() === '}' ? ' ' : match;
      })
      .replace(/\s*\[\s*/g, (match) => {
        return match.trim() === '[' ? ' ' : match;
      })
      .replace(/\s*\]\s*/g, (match) => {
        return match.trim() === ']' ? ' ' : match;
      })
      
      // Smart comma handling - preserve meaningful commas
      .replace(/\s*,\s*/g, (match) => {
        const trimmed = match.trim();
        if (trimmed === ',') {
          return ', '; // Add space after comma
        }
        return match;
      })
      
      // Smart colon handling for key-value pairs
      .replace(/\s*:\s*/g, (match) => {
        const trimmed = match.trim();
        if (trimmed === ':') {
          return ': '; // Add space after colon
        }
        return match;
      })
      
      // Preserve meaningful quotes while cleaning unnecessary ones
      .replace(/"\s*([^"]+)\s*"/g, (_, content) => {
        // Analyze if quotes are meaningful
        if (this.isMeaningfulQuote(content)) {
          return `"${content}"`; // Keep meaningful quotes
        }
        return content; // Remove unnecessary quotes
      })
      
      // Clean up excessive whitespace while preserving structure
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n') // Preserve paragraph breaks
      .trim();
  }

  /**
   * Determine if quotes around content are meaningful
   */
  private isMeaningfulQuote(content: string): boolean {
    // Quotes are meaningful if:
    return (
      content.includes(':') || // Contains colons (likely key-value)
      !!content.match(/^[A-Z][^:]*$/) || // Title case without colons
      content.includes('"') || // Contains nested quotes
      content.includes("'") || // Contains apostrophes
      content.length > 20 || // Long content likely needs quotes
      content.includes('\n') || // Multi-line content
      !!content.match(/[.!?]$/) || // Ends with punctuation
      !!content.match(/^[0-9]/) // Starts with number
    );
  }

  /**
   * Advanced tokenization with sophisticated text analysis
   */
  private tokenizeText(text: string): Token[] {
    const tokens: Token[] = [];
    let currentPosition = 0;
    
    // Define sophisticated patterns for different token types
    const patterns = [
      // Emphasis patterns (must come before other patterns)
      { regex: /\*\*\*([^*]+)\*\*\*/g, type: 'emphasis' as const, formatting: 'emphasis' as const },
      { regex: /\*\*([^*]+)\*\*/g, type: 'bold' as const, formatting: 'bold' as const },
      { regex: /\*([^*]+)\*/g, type: 'emphasis' as const, formatting: 'italic' as const },
      { regex: /__([^_]+)__/g, type: 'bold' as const, formatting: 'bold' as const },
      { regex: /_([^_]+)_/g, type: 'emphasis' as const, formatting: 'italic' as const },
      
      // Highlighting patterns
      { regex: /\[([^\]]+)\]/g, type: 'highlight' as const, formatting: 'highlight' as const },
      { regex: /\{([^}]+)\}/g, type: 'highlight' as const, formatting: 'highlight' as const },
      { regex: /\(IMPORTANT:\s*([^)]+)\)/g, type: 'highlight' as const, formatting: 'highlight' as const },
      
      // Quote patterns
      { regex: /"([^"]+)"/g, type: 'quote' as const, formatting: 'quote' as const },
      { regex: /'([^']+)'/g, type: 'quote' as const, formatting: 'quote' as const },
      
      // Structural elements
      { regex: /,/g, type: 'comma' as const },
      { regex: /:/g, type: 'colon' as const },
      { regex: /;/g, type: 'semicolon' as const },
      { regex: /\./g, type: 'period' as const },
      { regex: /\{/g, type: 'brace' as const },
      { regex: /\}/g, type: 'brace' as const },
      { regex: /\[/g, type: 'bracket' as const },
      { regex: /\]/g, type: 'bracket' as const },
      { regex: /\n/g, type: 'newline' as const },
      
      // Key-value patterns
      { regex: /([A-Za-z\s]+):\s*([^,\n.]+)/g, type: 'key' as const }
    ];

    let remainingText = text;
    
    while (remainingText.length > 0) {
      let matchFound = false;
      
      for (const pattern of patterns) {
        const match = pattern.regex.exec(remainingText);
        if (match) {
          // Add text before match
          if (match.index > 0) {
            const beforeText = remainingText.substring(0, match.index);
            if (beforeText.trim()) {
              tokens.push({
                type: 'text',
                value: beforeText,
                position: currentPosition
              });
              currentPosition += beforeText.length;
            }
          }
          
          // Add the matched token
          const tokenValue = pattern.type === 'key' ? match[0] : (match[1] || match[0]);
          tokens.push({
            type: pattern.type,
            value: tokenValue,
            position: currentPosition,
            formatting: pattern.formatting
          });
          currentPosition += match[0].length;
          
          // Update remaining text
          remainingText = remainingText.substring(match.index + match[0].length);
          matchFound = true;
          break;
        }
      }
      
      if (!matchFound) {
        // No pattern matched, add remaining text as text token
        if (remainingText.trim()) {
          tokens.push({
            type: 'text',
            value: remainingText,
            position: currentPosition
          });
        }
        break;
      }
    }
    
    return tokens;
  }

  /**
   * Process tokens into structured content with advanced formatting
   */
  private processTokensIntoStructuredContent(tokens: Token[], level: number): DecodedSection[] {
    const sections: DecodedSection[] = [];
    let currentSection: DecodedSection | null = null;
    let currentParagraph: React.ReactElement[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Handle different token types with sophisticated logic
      switch (token.type) {
        case 'newline':
          // Check if this indicates a new section
          if (this.shouldStartNewSection(tokens, i)) {
            if (currentSection && currentParagraph.length > 0) {
              currentSection.content.push(...currentParagraph);
              sections.push(currentSection);
            }
            
            // Create new section
            const sectionHeading = this.extractSectionHeading(tokens, i);
            currentSection = {
              heading: sectionHeading,
              content: [],
              level: level,
              type: this.determineSectionType(sectionHeading, level)
            };
            currentParagraph = [];
          } else if (currentParagraph.length > 0) {
            // End current paragraph
            if (currentSection) {
              currentSection.content.push(...currentParagraph);
            }
            currentParagraph = [];
          }
          break;
          
        case 'text':
          // Process text with advanced formatting
          const formattedText = this.formatTextToken(token, tokens, i);
          currentParagraph.push(formattedText);
          break;
          
        case 'quote':
          if (this.options.enableQuotes) {
            const quoteElement = this.createQuoteElement(token, level);
            currentParagraph.push(quoteElement);
          } else {
            currentParagraph.push(React.createElement('span', { key: `text-${this.elementCounter++}` }, token.value));
          }
          break;
          
        case 'emphasis':
        case 'bold':
        case 'highlight':
          const emphasisElement = this.createEmphasisElement(token, level);
          currentParagraph.push(emphasisElement);
          break;
          
        case 'comma':
        case 'colon':
        case 'semicolon':
        case 'period':
          // Add punctuation with proper spacing
          const punctuationElement = this.createPunctuationElement(token, level);
          currentParagraph.push(punctuationElement);
          break;
          
        case 'brace':
        case 'bracket':
          // Handle structural elements
          const structureElement = this.createStructureElement(token, level);
          currentParagraph.push(structureElement);
          break;
          
        case 'key':
          // Handle key-value pairs
          const keyValueElement = this.createKeyValueElement(token, level);
          currentParagraph.push(keyValueElement);
          break;
      }
    }
    
    // Add final paragraph and section
    if (currentParagraph.length > 0 && currentSection) {
      currentSection.content.push(...currentParagraph);
    }
    
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  /**
   * Determine if a newline should start a new section
   */
  private shouldStartNewSection(tokens: Token[], currentIndex: number): boolean {
    // Look ahead to see if there's a heading pattern
    for (let i = currentIndex + 1; i < Math.min(currentIndex + 5, tokens.length); i++) {
      const token = tokens[i];
      
      // Check for heading indicators
      if (token.type === 'text') {
        const text = token.value.trim();
        if (
          text.endsWith(':') ||
          /^\d+\./.test(text) ||
          /^[A-Z][A-Za-z\s]*$/.test(text) ||
          /^(Overview|Summary|Analysis|Recommendations?|Strategies?|Insights?|Conclusions?|Key Points?|Important|Note|Warning|Tips?)/i.test(text)
        ) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Extract section heading from tokens
   */
  private extractSectionHeading(tokens: Token[], startIndex: number): string {
    let heading = '';
    
    for (let i = startIndex + 1; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (token.type === 'newline') {
        break;
      }
      
      if (token.type === 'text') {
        heading += token.value;
      } else if (token.type === 'colon') {
        heading += ':';
        break;
      }
    }
    
    return this.cleanHeadingText(heading);
  }

  /**
   * Clean heading text
   */
  private cleanHeadingText(text: string): string {
    return text
      .replace(/^\d+\.\s*/, '') // Remove numbering
      .replace(/:$/, '') // Remove trailing colon
      .replace(/^\*+\s*/, '') // Remove leading asterisks
      .replace(/\*+$/, '') // Remove trailing asterisks
      .trim();
  }

  /**
   * Determine section type based on heading and level
   */
  private determineSectionType(heading: string, level: number): DecodedSection['type'] {
    if (level === 0) return 'heading';
    if (level === 1) return 'subheading';
    if (heading.toLowerCase().includes('quote') || heading.includes('"')) return 'quote';
    if (heading.toLowerCase().includes('emphasis') || heading.includes('*')) return 'emphasis';
    return 'content';
  }

  /**
   * Format text token with advanced processing
   */
  private formatTextToken(token: Token, _allTokens: Token[], _currentIndex: number): React.ReactElement {
    const key = `text-${this.elementCounter++}`;
    
    // Check if this text should be formatted as a heading
    if (this.isHeadingText(token.value)) {
      return React.createElement(
        'h4',
        {
          key,
          className: `${this.options.customClassPrefix}-heading ${this.options.customClassPrefix}-level-${token.position}`
        },
        token.value
      );
    }
    
    // Check if this text should be formatted as a paragraph
    if (this.isParagraphText(token.value)) {
      return React.createElement(
        'p',
        {
          key,
          className: `${this.options.customClassPrefix}-paragraph ${this.options.customClassPrefix}-level-${token.position}`
        },
        token.value
      );
    }
    
    // Default text formatting
    return React.createElement(
      'span',
      {
        key,
        className: `${this.options.customClassPrefix}-text ${this.options.customClassPrefix}-level-${token.position}`
      },
      token.value
    );
  }

  /**
   * Check if text should be formatted as a heading
   */
  private isHeadingText(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.endsWith(':') ||
      /^\d+\./.test(trimmed) ||
      /^[A-Z][A-Za-z\s]*$/.test(trimmed) ||
      /^(Overview|Summary|Analysis|Recommendations?|Strategies?|Insights?|Conclusions?|Key Points?|Important|Note|Warning|Tips?)/i.test(trimmed)
    );
  }

  /**
   * Check if text should be formatted as a paragraph
   */
  private isParagraphText(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.length > 50 ||
      trimmed.includes('.') ||
      trimmed.includes(',') ||
      trimmed.includes(';')
    );
  }

  /**
   * Create quote element with sophisticated styling
   */
  private createQuoteElement(token: Token, level: number): React.ReactElement {
    const key = `quote-${this.elementCounter++}`;
    
    return React.createElement(
      'span',
      {
        key,
        className: `${this.options.customClassPrefix}-quote ${this.options.customClassPrefix}-level-${level}`
      },
      '"',
      token.value,
      '"'
    );
  }

  /**
   * Create emphasis element with proper formatting
   */
  private createEmphasisElement(token: Token, level: number): React.ReactElement {
    const key = `emphasis-${this.elementCounter++}`;
    const className = `${this.options.customClassPrefix}-${token.formatting} ${this.options.customClassPrefix}-level-${level}`;
    
    switch (token.formatting) {
      case 'bold':
        return React.createElement('strong', { key, className }, token.value);
      case 'italic':
        return React.createElement('em', { key, className }, token.value);
      case 'emphasis':
        return React.createElement('em', { key, className }, token.value);
      case 'highlight':
        return React.createElement(
          'span',
          { key, className },
          token.value
        );
      default:
        return React.createElement('span', { key, className }, token.value);
    }
  }

  /**
   * Create punctuation element with proper spacing
   */
  private createPunctuationElement(token: Token, level: number): React.ReactElement {
    const key = `punctuation-${this.elementCounter++}`;
    
    return React.createElement(
      'span',
      {
        key,
        className: `${this.options.customClassPrefix}-punctuation ${this.options.customClassPrefix}-level-${level}`
      },
      token.value
    );
  }

  /**
   * Create structure element (braces, brackets)
   */
  private createStructureElement(token: Token, level: number): React.ReactElement {
    const key = `structure-${this.elementCounter++}`;
    
    return React.createElement(
      'span',
      {
        key,
        className: `${this.options.customClassPrefix}-structure ${this.options.customClassPrefix}-level-${level}`
      },
      token.value
    );
  }

  /**
   * Create key-value element
   */
  private createKeyValueElement(token: Token, level: number): React.ReactElement {
    const key = `keyvalue-${this.elementCounter++}`;
    const [keyPart, valuePart] = token.value.split(':').map(part => part.trim());
    
    return React.createElement(
      'span',
      {
        key,
        className: `${this.options.customClassPrefix}-keyvalue ${this.options.customClassPrefix}-level-${level}`
      },
      React.createElement(
        'span',
        { className: `${this.options.customClassPrefix}-key` },
        keyPart + ':'
      ),
      ' ',
      React.createElement(
        'span',
        { className: `${this.options.customClassPrefix}-value` },
        valuePart
      )
    );
  }

  /**
   * Process cached tokens for performance
   */
  private processCachedTokens(tokens: Token[], level: number): DecodedSection[] {
    return this.processTokensIntoStructuredContent(tokens, level);
  }

  /**
   * Decode array with structure preservation
   */
  private decodeArrayWithStructure(data: any[], level: number): DecodedSection[] {
    const sections: DecodedSection[] = [];
    
    if (data.length === 0) {
      return [{
        heading: 'Empty Array',
        content: [this.createContentElement('No items available', level)],
        level: level,
        type: 'content'
      }];
    }
    
    data.forEach((item, index) => {
      if (this.options.enableDebugLogging) {
        console.log(`[JSONDecoder] Processing array item ${index + 1}, type: ${typeof item}`);
      }
      
      const itemSections = this.decodeJSON(item, level + 1);
      
      if (itemSections.length > 0) {
        // Add array index as heading if there are multiple items or if items are complex
        if (data.length > 1 || typeof item === 'object') {
          const indexHeading = `Item ${index + 1}`;
          sections.push({
            heading: indexHeading,
            content: [],
            level: level,
            type: 'subheading'
          });
        }
        
        // Add all decoded sections from the item
        sections.push(...itemSections);
      } else {
        // Handle cases where item doesn't decode to anything meaningful
        sections.push({
          heading: data.length > 1 ? `Item ${index + 1}` : 'Value',
          content: [this.createContentElement(String(item), level + 1)],
          level: level,
          type: 'content'
        });
      }
    });
    
    return sections;
  }

  /**
   * Decode object with structure preservation
   */
  private decodeObjectWithStructure(data: Record<string, any>, level: number): DecodedSection[] {
    const sections: DecodedSection[] = [];
    
    if (!data || typeof data !== 'object') {
      return [{
        heading: 'Invalid Object',
        content: [this.createContentElement('Object is null or invalid', level)],
        level: level,
        type: 'content'
      }];
    }
    
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return [{
        heading: 'Empty Object',
        content: [this.createContentElement('No properties available', level)],
        level: level,
        type: 'content'
      }];
    }
    
    entries.forEach(([key, value]) => {
      const formattedKey = this.formatObjectKey(key);
      
      if (this.options.enableDebugLogging) {
        console.log(`[JSONDecoder] Processing object key: "${key}", type: ${typeof value}`);
      }
      
      // ✅ Check if this element should be skipped from decoding
      if (this.options.skipDecodingForElements && this.options.skipDecodingForElements.includes(key)) {
        if (this.options.enableDebugLogging) {
          console.log(`[JSONDecoder] Skipping decoding for element: "${key}"`);
        }
        // Keep raw JSON for specified elements
        sections.push({
          heading: formattedKey,
          content: [this.createRawJSONElement(value, level + 1)],
          level: level,
          type: level === 0 ? 'heading' : 'subheading'
        });
        return;
      }
      
      // Handle null or undefined values
      if (value === null) {
        sections.push({
          heading: formattedKey,
          content: [this.createContentElement('null', level + 1)],
          level: level,
          type: level === 0 ? 'heading' : 'subheading'
        });
        return;
      }
      
      if (value === undefined) {
        sections.push({
          heading: formattedKey,
          content: [this.createContentElement('undefined', level + 1)],
          level: level,
          type: level === 0 ? 'heading' : 'subheading'
        });
        return;
      }
      
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        // Simple key-value pair - but check if string contains nested JSON
        if (typeof value === 'string' && this.looksLikeNestedJSON(value)) {
          if (this.options.enableDebugLogging) {
            console.log(`[JSONDecoder] Key "${key}" contains nested JSON in string value`);
          }
          const nestedSections = this.decodeStringWithAdvancedFormatting(value, level + 1);
          if (nestedSections.length > 0) {
            sections.push({
              heading: formattedKey,
              content: [],
              level: level,
              type: level === 0 ? 'heading' : 'subheading'
            });
            sections.push(...nestedSections);
            return;
          }
        }
        
        // Regular simple value
        sections.push({
          heading: formattedKey,
          content: [this.createContentElement(String(value), level + 1)],
          level: level,
          type: level === 0 ? 'heading' : 'subheading'
        });
      } else {
        // Complex nested structure - decode recursively
        const nestedSections = this.decodeJSON(value, level + 1);
        
        if (this.options.enableDebugLogging) {
          console.log(`[JSONDecoder] Key "${key}" nested decoding generated ${nestedSections.length} sections`);
        }
        
        if (nestedSections.length > 0) {
          // Always create a main heading for complex structures
          sections.push({
            heading: formattedKey,
            content: [],
            level: level,
            type: level === 0 ? 'heading' : 'subheading'
          });
          
          // Add all nested sections
          sections.push(...nestedSections);
        } else {
          // Empty or undefined nested structure
          sections.push({
            heading: formattedKey,
            content: [this.createContentElement('No data available', level + 1)],
            level: level,
            type: level === 0 ? 'heading' : 'subheading'
          });
        }
      }
    });
    
    return sections;
  }

  /**
   * Format object keys into readable headings
   */
  private formatObjectKey(key: string): string {
    return key
      // Convert camelCase to Title Case
      .replace(/([A-Z])/g, ' $1')
      // Convert snake_case to Title Case
      .replace(/_/g, ' ')
      // Convert kebab-case to Title Case
      .replace(/-/g, ' ')
      // Capitalize first letter of each word
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  /**
   * Create content element
   */
  private createContentElement(text: string, level: number): React.ReactElement {
    const key = `content-${level}-${this.elementCounter++}`;
    
    return React.createElement(
      'p',
      {
        key,
        className: `${this.options.customClassPrefix}-content ${this.options.customClassPrefix}-level-${level}`
      },
      text
    );
  }

  /**
   * Decode primitive with formatting
   */
  private decodePrimitiveWithFormatting(data: any, level: number): DecodedSection[] {
    return [{
      heading: 'Value',
      content: [this.createContentElement(String(data), level)],
      level: level,
      type: 'content'
    }];
  }

  /**
   * Create a raw JSON element for elements that should be skipped from decoding
   */
  private createRawJSONElement(data: any, level: number): React.ReactElement {
    const key = `raw-json-${this.elementCounter++}`;
    return React.createElement(
      'pre',
      {
        key,
        className: `${this.options.customClassPrefix}-raw-json ${this.options.customClassPrefix}-level-${level}`
      },
      JSON.stringify(data, null, 2)
    );
  }
}

// Export the main decoder function
export const decodeJSONToReactElements = (
  data: any, 
  options: DecodingOptions = {}
): DecodedSection[] => {
  const decoder = new AdvancedJSONDecoder(options);
  return decoder.decodeJSON(data);
};

// Export a simplified version for backward compatibility
export const decodeRawContent = (
  rawText: string,
  options: DecodingOptions = {}
): { heading: string; content: React.ReactElement[] }[] => {
  const decoder = new AdvancedJSONDecoder(options);
  const sections = decoder.decodeJSON(rawText);
  
  return sections.map(section => ({
    heading: section.heading,
    content: section.content
  }));
};

// Export utility functions
export const formatCount = (count: number | undefined): string => {
  if (count === undefined || count === null) return 'N/A';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

export const cleanText = (text: string): string => {
  const decoder = new AdvancedJSONDecoder();
  return decoder['advancedJSONCleaning'](text);
};

export default AdvancedJSONDecoder; 