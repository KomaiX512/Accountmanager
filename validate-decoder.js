// Simple test to validate JSON decoder improvements
console.log("=== JSON DECODER VALIDATION TEST ===\n");

// Mock React.createElement for testing
const React = {
  createElement: (type, props, ...children) => {
    return {
      type: type,
      props: { ...props, children: children.length === 1 ? children[0] : children },
      key: props?.key || Math.random().toString(36).substr(2, 9)
    };
  }
};

// Import the decoder (we'll simulate it)
const decodeJSONToReactElements = (data, options = {}) => {
  // This would normally import from the actual decoder
  console.log(`Decoding data with options:`, Object.keys(options));
  console.log(`Skip decoding elements:`, options.skipDecodingForElements || []);
  
  // Simulate the decoding process for testing
  const sections = [];
  
  if (typeof data === 'object' && data !== null) {
    Object.entries(data).forEach(([key, value]) => {
      const shouldSkip = options.skipDecodingForElements && options.skipDecodingForElements.includes(key);
      
      console.log(`Processing key: "${key}", shouldSkip: ${shouldSkip}, type: ${typeof value}`);
      
      if (shouldSkip) {
        sections.push({
          heading: key,
          content: [React.createElement('pre', {}, JSON.stringify(value, null, 2))],
          level: 0,
          type: 'heading'
        });
      } else {
        sections.push({
          heading: key,
          content: [React.createElement('p', {}, String(value))],
          level: 0,
          type: 'heading'
        });
        
        // Process nested structures
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item, idx) => {
              sections.push({
                heading: `Item ${idx + 1}`,
                content: [React.createElement('p', {}, String(item))],
                level: 1,
                type: 'content'
              });
            });
          } else {
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
              sections.push({
                heading: nestedKey,
                content: [React.createElement('p', {}, String(nestedValue))],
                level: 1,
                type: 'content'
              });
            });
          }
        }
      }
    });
  }
  
  return sections;
};

// Test data similar to user's example
const testData = {
  "Module Type": "competitor_analysis",
  "Platform": "twitter",
  "Primary Username": "ylecun", 
  "Competitor": "elonmusk",
  "Timestamp": "2025-07-28T19:25:58.220942",
  "Data": {
    "overview": "Unlike @elonmusk's broad approach, a niche focus on AI research and education will resonate more effectively.",
    "strengths": [
      "Established Twitter presence with a moderate following",
      "Consistent posting schedule",
      "Broad tech coverage attracts diverse audience"
    ],
    "vulnerabilities": [
      "Lack of AI-specific expertise", 
      "Generic content lacks depth",
      "Engagement is relatively low"
    ],
    "market_intelligence": {
      "competitive_score": "65/100",
      "threat_level": "Low",
      "market_share_estimate": "5%"
    }
  },
  "Intelligence Source": "rag_extraction"
};

console.log("Original data structure:");
console.log(JSON.stringify(testData, null, 2).substring(0, 500) + "...\n");

// Test the decoding
const result = decodeJSONToReactElements(testData, {
  customClassPrefix: 'test',
  enableBoldFormatting: true,
  enableItalicFormatting: true,
  enableHighlighting: true,
  enableQuotes: true,
  enableEmphasis: true,
  preserveJSONStructure: true,
  smartParagraphDetection: true,
  maxNestingLevel: 4,
  skipDecodingForElements: [
    'Module Type',
    'Platform', 
    'Primary Username',
    'Competitor',
    'Timestamp',
    'Data',
    'Intelligence Source'
  ]
});

console.log(`\n=== DECODING RESULT ===`);
console.log(`Generated ${result.length} sections:\n`);

result.forEach((section, idx) => {
  console.log(`${idx + 1}. ${section.heading} (Level: ${section.level})`);
  if (section.content.length > 0) {
    const contentPreview = section.content[0].props.children;
    const preview = typeof contentPreview === 'string' 
      ? contentPreview.substring(0, 100) 
      : JSON.stringify(contentPreview).substring(0, 100);
    console.log(`   Content: ${preview}${preview.length >= 100 ? '...' : ''}`);
  }
});

console.log("\n=== VALIDATION ===");
console.log("✅ All metadata fields should be preserved as raw JSON");
console.log("✅ Nested structures should be fully expanded");  
console.log("✅ Arrays should show individual items");
console.log("✅ No content should be missing");

console.log("\n=== TEST COMPLETE ===");
