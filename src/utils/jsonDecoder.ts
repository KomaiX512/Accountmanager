import React from 'react';

export interface DecodedSection {
  heading: string;
  content: React.ReactElement[];
  level: number;
  type: 'heading' | 'subheading' | 'content' | 'list' | 'bullet';
}

export interface DecodingOptions {
  preserveLineBreaks?: boolean;
  enableBoldFormatting?: boolean;
  enableItalicFormatting?: boolean;
  enableHighlighting?: boolean;
  maxNestingLevel?: number;
  customClassPrefix?: string;
}

class JSONDecoder {
  private options: DecodingOptions;
  private elementCounter: number = 0;

  constructor(options: DecodingOptions = {}) {
    this.options = {
      preserveLineBreaks: true,
      enableBoldFormatting: true,
      enableItalicFormatting: true,
      enableHighlighting: true,
      maxNestingLevel: 5,
      customClassPrefix: 'decoded',
      ...options
    };
  }

  /**
   * Main decoding function that processes any JSON structure
   */
  public decodeJSON(data: any, level: number = 0): DecodedSection[] {
    if (!data) return [];

    // Handle different data types
    if (typeof data === 'string') {
      return this.decodeString(data, level);
    } else if (Array.isArray(data)) {
      return this.decodeArray(data, level);
    } else if (typeof data === 'object') {
      return this.decodeObject(data, level);
    } else {
      return this.decodePrimitive(data, level);
    }
  }

  /**
   * Decode string content with advanced formatting
   */
  private decodeString(text: string, level: number): DecodedSection[] {
    if (!text || typeof text !== 'string') return [];

    // Clean the string from JSON artifacts
    const cleanedText = this.cleanJSONArtifacts(text);
    
    // Split into logical sections
    const sections = this.parseTextSections(cleanedText, level);
    
    return sections;
  }

  /**
   * Clean JSON artifacts and special characters
   */
  private cleanJSONArtifacts(text: string): string {
    return text
      // Remove JSON escape characters
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      
      // Clean up extra whitespace and formatting
      .replace(/\s*\{\s*/g, ' ')
      .replace(/\s*\}\s*/g, ' ')
      .replace(/\s*\[\s*/g, ' ')
      .replace(/\s*\]\s*/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*:\s*/g, ': ')
      
      // Remove quotes around values but preserve meaningful quotes
      .replace(/"\s*([^"]+)\s*"/g, (match, content) => {
        // Keep quotes if they seem intentional (like in titles or emphasis)
        if (content.includes(':') || content.match(/^[A-Z][^:]*$/)) {
          return content;
        }
        return `"${content}"`;
      })
      
      // Clean up multiple spaces and line breaks
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Parse text into logical sections with headings and content
   */
  private parseTextSections(text: string, level: number): DecodedSection[] {
    const sections: DecodedSection[] = [];
    
    // Split by common delimiters that indicate new sections
    const parts = text.split(/(?:\.|;|\n)(?=\s*[A-Z]|\s*\*|\s*-|\s*\d+\.)/);
    
    let currentSection: DecodedSection | null = null;
    
    parts.forEach((part, index) => {
      const trimmedPart = part.trim();
      if (!trimmedPart) return;

      // Detect if this is a heading
      if (this.isHeading(trimmedPart)) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        
        // Create new section
        currentSection = {
          heading: this.cleanHeading(trimmedPart),
          content: [],
          level: level,
          type: this.getHeadingType(trimmedPart, level)
        };
      } else if (currentSection) {
        // Add content to current section
        const formattedContent = this.formatContent(trimmedPart, level + 1);
        currentSection.content.push(...formattedContent);
      } else {
        // Create a default section for orphaned content
        currentSection = {
          heading: 'Details',
          content: this.formatContent(trimmedPart, level + 1),
          level: level,
          type: 'content'
        };
      }
    });

    // Add the last section
    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Determine if a text part is a heading
   */
  private isHeading(text: string): boolean {
    return (
      // Ends with colon
      text.endsWith(':') ||
      // Starts with number and dot
      /^\d+\./.test(text) ||
      // All caps or title case without much punctuation
      (/^[A-Z][A-Za-z\s]*$/.test(text) && text.length < 50) ||
      // Common heading patterns
      /^(Overview|Summary|Analysis|Recommendations?|Strategies?|Insights?|Conclusions?|Key Points?|Important|Note|Warning|Tips?)/i.test(text)
    );
  }

  /**
   * Clean heading text
   */
  private cleanHeading(text: string): string {
    return text
      .replace(/^\d+\.\s*/, '') // Remove numbering
      .replace(/:$/, '') // Remove trailing colon
      .replace(/^\*+\s*/, '') // Remove leading asterisks
      .replace(/\*+$/, '') // Remove trailing asterisks
      .trim();
  }

  /**
   * Determine heading type based on content and level
   */
  private getHeadingType(text: string, level: number): 'heading' | 'subheading' | 'content' | 'list' | 'bullet' {
    if (level === 0) return 'heading';
    if (level === 1) return 'subheading';
    return 'content';
  }

  /**
   * Format content with advanced text processing
   */
  private formatContent(text: string, level: number): React.ReactElement[] {
    const elements: React.ReactElement[] = [];
    
    // Split by bullet points and list items
    const items = text.split(/(?=\*|\-|\•|→|▪|▫|‣)/).filter(item => item.trim());
    
    if (items.length > 1) {
      // This is a list
      items.forEach((item, index) => {
        const cleanItem = item.replace(/^[\*\-\•→▪▫‣]\s*/, '').trim();
        if (cleanItem) {
          elements.push(this.createListItem(cleanItem, index, level));
        }
      });
    } else {
      // Single content item
      elements.push(this.createContentElement(text, level));
    }
    
    return elements;
  }

  /**
   * Create a list item element
   */
  private createListItem(text: string, index: number, level: number): React.ReactElement {
    const formattedText = this.applyTextFormatting(text);
    const key = `list-item-${level}-${index}-${this.elementCounter++}`;
    
    return React.createElement(
      'p',
      {
        key,
        className: `${this.options.customClassPrefix}-list-item ${this.options.customClassPrefix}-level-${level}`
      },
      '• ',
      ...formattedText
    );
  }

  /**
   * Create a content element
   */
  private createContentElement(text: string, level: number): React.ReactElement {
    const formattedText = this.applyTextFormatting(text);
    const key = `content-${level}-${this.elementCounter++}`;
    
    return React.createElement(
      'p',
      {
        key,
        className: `${this.options.customClassPrefix}-content ${this.options.customClassPrefix}-level-${level}`
      },
      ...formattedText
    );
  }

  /**
   * Apply text formatting (bold, italic, highlighting)
   */
  private applyTextFormatting(text: string): (string | React.ReactElement)[] {
    const elements: (string | React.ReactElement)[] = [];
    let currentIndex = 0;
    
    // Process text with various formatting patterns
    const patterns = [
      // Bold patterns: *text*, **text**, ***text***
      { regex: /\*{1,3}([^*]+)\*{1,3}/g, type: 'bold' },
      // Italic patterns: _text_, __text__
      { regex: /_{1,2}([^_]+)_{1,2}/g, type: 'italic' },
      // Highlighting: [text], {text}, (IMPORTANT: text)
      { regex: /\[([^\]]+)\]|\{([^}]+)\}|\(IMPORTANT:\s*([^)]+)\)/g, type: 'highlight' },
      // Key-value pairs: "key: value"
      { regex: /([A-Za-z\s]+):\s*([^,\n.]+)/g, type: 'keyvalue' }
    ];

    let processedText = text;
    let elementIndex = 0;

    patterns.forEach(pattern => {
      const matches = Array.from(processedText.matchAll(pattern.regex));
      
      matches.forEach(match => {
        const beforeMatch = processedText.substring(0, match.index);
        const matchedText = match[1] || match[2] || match[3] || match[0];
        
        if (beforeMatch) {
          elements.push(beforeMatch);
        }

        // Create formatted element based on type
        switch (pattern.type) {
          case 'bold':
            if (this.options.enableBoldFormatting) {
              elements.push(
                React.createElement('strong', { key: `bold-${elementIndex++}` }, matchedText)
              );
            } else {
              elements.push(matchedText);
            }
            break;
            
          case 'italic':
            if (this.options.enableItalicFormatting) {
              elements.push(
                React.createElement('em', { key: `italic-${elementIndex++}` }, matchedText)
              );
            } else {
              elements.push(matchedText);
            }
            break;
            
          case 'highlight':
            if (this.options.enableHighlighting) {
              elements.push(
                React.createElement(
                  'span',
                  { 
                    key: `highlight-${elementIndex++}`,
                    className: `${this.options.customClassPrefix}-highlight`
                  },
                  matchedText
                )
              );
            } else {
              elements.push(matchedText);
            }
            break;
            
          case 'keyvalue':
            const [, key, value] = match;
            elements.push(
              React.createElement(
                'span',
                { key: `keyvalue-${elementIndex++}` },
                React.createElement(
                  'span',
                  { className: `${this.options.customClassPrefix}-key` },
                  key.trim() + ':'
                ),
                ' ',
                React.createElement(
                  'span',
                  { className: `${this.options.customClassPrefix}-value` },
                  value.trim()
                )
              )
            );
            break;
        }

        // Update processed text to remove the matched part
        processedText = processedText.substring((match.index || 0) + match[0].length);
      });
    });

    // Add any remaining text
    if (processedText) {
      elements.push(processedText);
    }

    // If no formatting was applied, return the original text
    return elements.length > 0 ? elements : [text];
  }

  /**
   * Decode array data
   */
  private decodeArray(data: any[], level: number): DecodedSection[] {
    const sections: DecodedSection[] = [];
    
    data.forEach((item, index) => {
      const itemSections = this.decodeJSON(item, level + 1);
      
      if (itemSections.length > 0) {
        // Add array index as heading if there are multiple items
        if (data.length > 1) {
          sections.push({
            heading: `Item ${index + 1}`,
            content: [],
            level: level,
            type: 'subheading'
          });
        }
        sections.push(...itemSections);
      }
    });
    
    return sections;
  }

  /**
   * Decode object data
   */
  private decodeObject(data: Record<string, any>, level: number): DecodedSection[] {
    const sections: DecodedSection[] = [];
    
    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = this.formatObjectKey(key);
      
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        // Simple key-value pair
        sections.push({
          heading: formattedKey,
          content: [this.createContentElement(String(value), level + 1)],
          level: level,
          type: level === 0 ? 'heading' : 'subheading'
        });
      } else {
        // Complex nested structure
        const nestedSections = this.decodeJSON(value, level + 1);
        
        if (nestedSections.length > 0) {
          sections.push({
            heading: formattedKey,
            content: [],
            level: level,
            type: level === 0 ? 'heading' : 'subheading'
          });
          sections.push(...nestedSections);
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
   * Decode primitive values
   */
  private decodePrimitive(data: any, level: number): DecodedSection[] {
    return [{
      heading: 'Value',
      content: [this.createContentElement(String(data), level)],
      level: level,
      type: 'content'
    }];
  }
}

// Export the main decoder function
export const decodeJSONToReactElements = (
  data: any, 
  options: DecodingOptions = {}
): DecodedSection[] => {
  const decoder = new JSONDecoder(options);
  return decoder.decodeJSON(data);
};

// Export a simplified version for backward compatibility
export const decodeRawContent = (
  rawText: string,
  options: DecodingOptions = {}
): { heading: string; content: React.ReactElement[] }[] => {
  const decoder = new JSONDecoder(options);
  const sections = decoder.decodeJSON(rawText);
  
  return sections.map(section => ({
    heading: section.heading,
    content: section.content
  }));
};

// Export utility functions
export const formatCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

export const cleanText = (text: string): string => {
  const decoder = new JSONDecoder();
  return decoder['cleanJSONArtifacts'](text);
};

export default JSONDecoder; 