// Test script for complex JSON decoding
const { decodeJSONToReactElements } = require('./src/utils/jsonDecoder.ts');

// Sample complex data structure similar to what the user provided
const complexData = {
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
    "recommended_counter_strategies": [
      "Focus on niche AI topics to attract a targeted audience",
      "Provide in-depth AI analysis to differentiate from general tech commentary",
      "Increase engagement by actively participating in AI-related discussions"
    ],
    "market_intelligence": {
      "competitive_score": "65/100",
      "threat_level": "Low", 
      "market_share_estimate": "5%",
      "growth_trajectory": "Stable",
      "key_differentiator": "Broad tech coverage"
    },
    "content_intelligence": {
      "top_performing_formats": ["Text-based tweets", "Links to external articles"],
      "posting_frequency": "Daily",
      "engagement_peak_times": "Mid-day",
      "hashtag_strategy": "General tech hashtags"
    },
    "competitors": {
      "elonmusk": {
        "overview": "Elon Musk's influence and large following present a significant threat to @ylecun's growth.",
        "strengths": ["Massive following and high engagement", "Strong brand recognition", "Influence on public opinion"],
        "vulnerabilities": ["Broad focus dilutes AI-specific content", "Can be controversial and polarizing", "Relies heavily on personal brand"],
        "market_intelligence": {
          "competitive_score": "95/100",
          "threat_level": "High",
          "market_share_estimate": "30%",
          "growth_trajectory": "High"
        }
      },
      "sama": {
        "overview": "Sam Altman's OpenAI affiliation gives him a competitive edge in the AI space.",
        "strengths": ["Direct access to OpenAI resources", "Strong network within AI community"],
        "vulnerabilities": ["Product-centric focus may alienate non-users", "Limited engagement with broader AI discussions"]
      }
    }
  },
  "Intelligence Source": "rag_extraction"
};

console.log("=== COMPLEX JSON DECODING TEST ===\n");

// Test with comprehensive decoding
const decodedSections = decodeJSONToReactElements(complexData, {
  customClassPrefix: 'test',
  enableBoldFormatting: true,
  enableItalicFormatting: true,
  enableHighlighting: true,
  enableQuotes: true,
  enableEmphasis: true,
  preserveJSONStructure: true,
  smartParagraphDetection: true,
  maxNestingLevel: 5,
  enableDebugLogging: true,
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

console.log(`\n=== DECODING RESULTS ===`);
console.log(`Generated ${decodedSections.length} sections:`);

decodedSections.forEach((section, idx) => {
  console.log(`\n${idx + 1}. ${section.heading} (Level: ${section.level}, Type: ${section.type})`);
  console.log(`   Content elements: ${section.content.length}`);
  
  if (section.content.length > 0) {
    section.content.forEach((content, contentIdx) => {
      if (content && content.props && content.props.children) {
        const text = typeof content.props.children === 'string' 
          ? content.props.children 
          : JSON.stringify(content.props.children).substring(0, 100);
        console.log(`     ${contentIdx + 1}: ${text}${text.length > 100 ? '...' : ''}`);
      }
    });
  }
});

console.log("\n=== VERIFICATION ===");
console.log("✅ Check if all main sections are present:");
console.log(`- Module Type: ${decodedSections.some(s => s.heading.includes('Module Type')) ? '✅' : '❌'}`);
console.log(`- Platform: ${decodedSections.some(s => s.heading.includes('Platform')) ? '✅' : '❌'}`);
console.log(`- Data sections: ${decodedSections.some(s => s.heading.includes('Overview')) ? '✅' : '❌'}`);
console.log(`- Nested arrays: ${decodedSections.some(s => s.heading.includes('Item')) ? '✅' : '❌'}`);
console.log(`- Complex objects: ${decodedSections.some(s => s.heading.includes('Market Intelligence')) ? '✅' : '❌'}`);

console.log("\n=== TEST COMPLETE ===");
