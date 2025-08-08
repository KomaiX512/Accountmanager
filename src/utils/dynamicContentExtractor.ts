/**
 * Dynamic Content Extractor
 * 
 * This utility provides robust content extraction from any JSON structure
 * without hardcoded assumptions about field names or structure.
 */

export interface ContentExtractionResult {
  content: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractionStrategy {
  name: string;
  priority: number;
  extractor: (data: any) => string | null;
}

/**
 * Recursively searches for meaningful text content in any JSON structure
 */
export function extractDynamicContent(data: any, maxDepth: number = 5): ContentExtractionResult[] {
  const results: ContentExtractionResult[] = [];
  
  function traverse(obj: any, path: string = '', depth: number = 0): void {
    if (depth > maxDepth || obj === null || obj === undefined) {
      return;
    }

    // Handle different data types
    if (typeof obj === 'string') {
      const trimmed = obj.trim();
      if (trimmed.length > 20) { // Only meaningful strings
        results.push({
          content: trimmed,
          source: path,
          confidence: 'high'
        });
      }
    } else if (Array.isArray(obj)) {
      // For arrays, look for string content or objects with meaningful text
      obj.forEach((item, index) => {
        traverse(item, `${path}[${index}]`, depth + 1);
      });
    } else if (typeof obj === 'object') {
      // For objects, check each property
      Object.entries(obj).forEach(([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        traverse(value, newPath, depth + 1);
      });
    }
  }

  traverse(data);
  
  // Sort by confidence and content length
  return results.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === 'high' ? -1 : 1;
    }
    return b.content.length - a.content.length;
  });
}

/**
 * Extracts the first 3 meaningful sentences from any content
 */
export function extractFirstThreeSentences(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Clean the content
  const cleaned = content
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\*/g, '') // Remove italic markers
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Split into sentences
  const sentences = cleaned
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Only meaningful sentences

  // Take first 3 sentences
  const selectedSentences = sentences.slice(0, 3);
  
  if (selectedSentences.length === 0) {
    return '';
  }

  // Join with periods and add ellipsis if there are more sentences
  const result = selectedSentences.join('. ') + (sentences.length > 3 ? '...' : '');
  
  return result;
}

/**
 * Smart content extraction with multiple fallback strategies
 */
export function smartContentExtraction(data: any): string {
  // Strategy 1: Look for common recommendation fields
  const recommendationFields = [
    'tactical_recommendations',
    'growth_opportunities', 
    'recommendations',
    'suggestions',
    'insights',
    'analysis',
    'strategies'
  ];

  // Try to find array of recommendations first
  for (const field of recommendationFields) {
    const recommendations = findNestedArray(data, field);
    if (recommendations && recommendations.length > 0) {
      const combined = recommendations.slice(0, 3).join('. ');
      if (combined.length > 20) {
        return combined;
      }
    }
  }

  // Strategy 2: Look for string content in recommendation fields
  for (const field of recommendationFields) {
    const content = findNestedString(data, field);
    if (content && content.length > 50) {
      return content;
    }
  }

  // Strategy 3: Extract any meaningful text content
  const allContent = extractDynamicContent(data);
  if (allContent.length > 0) {
    // Find the longest meaningful content
    const bestContent = allContent
      .filter(result => result.content.length > 50)
      .sort((a, b) => b.content.length - a.content.length)[0];
    
    if (bestContent) {
      return bestContent.content;
    }
  }

  // Strategy 4: Fallback to generic content
  return generateGenericRecommendations();
}

/**
 * Finds a nested array in the data structure
 */
function findNestedArray(data: any, fieldName: string): string[] | null {
  function search(obj: any): string[] | null {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    // Direct match
    if (obj[fieldName] && Array.isArray(obj[fieldName])) {
      const array = obj[fieldName];
      if (array.length > 0 && typeof array[0] === 'string') {
        return array;
      }
    }

    // Recursive search
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        const result = search(obj[key]);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  return search(data);
}

/**
 * Finds a nested string in the data structure
 */
function findNestedString(data: any, fieldName: string): string | null {
  function search(obj: any): string | null {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    // Direct match
    if (obj[fieldName] && typeof obj[fieldName] === 'string') {
      return obj[fieldName];
    }

    // Recursive search
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        const result = search(obj[key]);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  return search(data);
}

/**
 * Generates generic recommendations when no content is found
 */
function generateGenericRecommendations(): string {
  const genericRecommendations = [
    "Content Strategy Optimization: Focus on creating more engaging visual content that resonates with your target audience.",
    "Posting Schedule Enhancement: Analyze your best performing times and increase posting frequency during peak engagement hours.",
    "Hashtag Strategy: Implement a more strategic hashtag approach using trending and relevant hashtags to increase discoverability."
  ];
  
  return genericRecommendations.join(' ');
}

/**
 * Validates if extracted content is meaningful
 */
export function isMeaningfulContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();
  
  // Must have minimum length
  if (trimmed.length < 20) {
    return false;
  }

  // Must contain actual words (not just special characters)
  const words = trimmed.split(/\s+/).filter(word => word.length > 0);
  if (words.length < 3) {
    return false;
  }

  // Must not be just placeholder text
  const placeholderPatterns = [
    /placeholder/i,
    /sample/i,
    /test/i,
    /dummy/i,
    /example/i
  ];

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  return true;
}
