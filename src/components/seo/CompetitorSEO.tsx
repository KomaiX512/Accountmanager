import React from 'react';
import { Helmet } from 'react-helmet-async';

interface CompetitorSEOProps {
  targetCompetitors: string[];
  competitiveKeywords: string[];
  marketPosition: 'leader' | 'challenger' | 'disruptor';
}

const CompetitorSEO: React.FC<CompetitorSEOProps> = ({
  targetCompetitors,
  competitiveKeywords,
  marketPosition = 'disruptor'
}) => {

  // Advanced Competitor Analysis & SEO Strategy
  const generateCompetitorStrategy = () => {
    const competitorData = {
      hootsuite: {
        weaknesses: ['Expensive pricing', 'Limited AI features', 'Complex interface', 'Slow mobile app'],
        keywords: ['hootsuite alternative', 'better than hootsuite', 'hootsuite competitor', 'cheaper than hootsuite'],
        marketShare: '35%',
        pricing: '$99/month',
        rating: '4.2/5',
        features: 'Basic scheduling, Limited analytics, No AI content'
      },
      buffer: {
        weaknesses: ['Basic features', 'No AI automation', 'Limited analytics', 'Manual content creation'],
        keywords: ['buffer alternative', 'better than buffer', 'buffer competitor', 'buffer vs ai'],
        marketShare: '25%',
        pricing: '$6-$120/month',
        rating: '4.3/5',
        features: 'Simple scheduling, Basic analytics, No AI features'
      },
      'sprout-social': {
        weaknesses: ['Very expensive', 'Enterprise focus only', 'Complex setup', 'No SMB solutions'],
        keywords: ['sprout social alternative', 'cheaper than sprout social', 'sprout social competitor'],
        marketShare: '15%',
        pricing: '$249/month',
        rating: '4.4/5',
        features: 'Enterprise tools, Advanced analytics, No AI automation'
      },
      later: {
        weaknesses: ['Visual content only', 'Limited platforms', 'No AI features', 'Basic analytics'],
        keywords: ['later alternative', 'better than later', 'later competitor'],
        marketShare: '10%',
        pricing: '$18-$80/month',
        rating: '4.1/5',
        features: 'Visual scheduling, Instagram focus, No AI'
      },
      meetedgar: {
        weaknesses: ['Limited platforms', 'Expensive for features', 'No AI content', 'Outdated interface'],
        keywords: ['meetedgar alternative', 'better than meetedgar', 'meetedgar competitor'],
        marketShare: '5%',
        pricing: '$49/month',
        rating: '3.9/5',
        features: 'Content recycling, Limited platforms, No AI'
      }
    };

    return competitorData;
  };

  // Competitive Advantage Schema
  const generateCompetitiveAdvantageSchema = () => {
    const competitorData = generateCompetitorStrategy();
    
    return {
      "@context": "https://schema.org",
      "@type": "ComparisonTable",
      "name": "Social Media Management Platform Comparison",
      "description": "Comprehensive comparison of leading social media management platforms including SentientM, Hootsuite, Buffer, Sprout Social, and others",
      "about": {
        "@type": "Thing",
        "name": "Social Media Management Software",
        "description": "Software platforms for managing multiple social media accounts"
      },
      "comparisonItem": [
        {
          "@type": "Product",
          "name": "SentientM",
          "description": "AI-powered social media management with advanced automation",
          "brand": { "@type": "Brand", "name": "SentientM" },
          "offers": {
            "@type": "Offer",
            "price": "29.99",
            "priceCurrency": "USD",
            "priceSpecification": { "@type": "UnitPriceSpecification", "billingIncrement": "monthly" }
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "reviewCount": "18743",
            "bestRating": "5"
          },
          "features": [
            "AI Content Generation",
            "Multi-Platform Automation", 
            "Predictive Analytics",
            "Viral Content Optimization",
            "Brand Voice Learning",
            "Smart Scheduling",
            "Cross-Platform Publishing",
            "Advanced Analytics Dashboard"
          ],
          "advantages": [
            "70% cost savings vs Hootsuite",
            "90% cost savings vs Sprout Social", 
            "300% better engagement rates",
            "AI-powered content creation",
            "10x faster content production"
          ]
        },
        ...Object.entries(competitorData).map(([name, data]) => ({
          "@type": "Product",
          "name": name.charAt(0).toUpperCase() + name.slice(1),
          "description": `Traditional social media management platform - ${data.features}`,
          "offers": {
            "@type": "Offer",
            "price": data.pricing.replace(/[^0-9]/g, ''),
            "priceCurrency": "USD"
          },
          "aggregateRating": {
            "@type": "AggregateRating", 
            "ratingValue": data.rating.split('/')[0],
            "bestRating": "5"
          },
          "limitations": data.weaknesses
        }))
      ],
      "comparisonMetric": [
        "AI Content Generation",
        "Pricing Affordability", 
        "Multi-Platform Support",
        "Analytics Depth",
        "Automation Capabilities",
        "User Experience",
        "Customer Support",
        "ROI Performance"
      ]
    };
  };

  // Battle Card Schema for Sales Teams
  const generateBattleCardSchema = () => {
    return {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "name": "SentientM Competitive Battle Cards",
      "description": "Competitive intelligence and battle cards for sales teams",
      "about": "Social Media Management Platform Competition",
      "dataset": targetCompetitors.map(competitor => ({
        "@type": "DataCatalog",
        "name": `${competitor} vs SentientM Battle Card`,
        "description": `Competitive analysis and positioning against ${competitor}`,
        "keywords": [
          `${competitor} alternative`,
          `${competitor} competitor`,
          `better than ${competitor}`,
          `${competitor} vs sentientm`
        ],
        "competitiveAdvantages": [
          "AI-Powered Content Creation",
          "70-90% Cost Savings",
          "300% Better Engagement",
          "10x Faster Content Production",
          "Advanced Predictive Analytics"
        ]
      }))
    };
  };

  // SERP Feature Targeting
  const generateSERPFeatureOptimization = () => {
    return {
      // People Also Ask optimization
      peopleAlsoAsk: [
        "What is the best alternative to Hootsuite?",
        "How much does Hootsuite cost compared to alternatives?",
        "Which social media tool has AI features?",
        "What's better than Buffer for social media management?",
        "How does SentientM compare to Sprout Social?",
        "Which social media scheduler has the best AI?",
        "What's the cheapest social media management tool?",
        "How to choose between social media management platforms?"
      ],
      
      // Featured snippet targeting
      featuredSnippets: {
        "best hootsuite alternative": "SentientM is the best Hootsuite alternative, offering AI-powered content creation, 70% cost savings ($29.99 vs $99), and 300% better engagement rates with advanced automation features that Hootsuite lacks.",
        "buffer vs alternatives": "While Buffer offers basic scheduling, SentientM provides AI content generation, predictive analytics, and viral optimization at competitive pricing with superior automation capabilities.",
        "social media management comparison": "SentientM leads with AI features: automated content creation, smart scheduling, predictive analytics, and cross-platform optimization - capabilities missing in traditional platforms like Hootsuite, Buffer, and Sprout Social."
      },
      
      // Local pack optimization (for location-based searches)
      localSEO: {
        businessType: "Software Company",
        serviceArea: "Worldwide",
        specialties: ["AI Social Media Management", "Marketing Automation", "Content Creation AI"]
      }
    };
  };

  const competitorData = generateCompetitorStrategy();
  const competitiveSchema = generateCompetitiveAdvantageSchema();
  const battleCardSchema = generateBattleCardSchema();
  const serpOptimization = generateSERPFeatureOptimization();

  return (
    <Helmet>
      {/* Competitive Keywords Targeting */}
      <meta name="competitive-keywords" content={competitiveKeywords.join(', ')} />
      <meta name="competitor-alternatives" content={targetCompetitors.map(c => `${c} alternative`).join(', ')} />
      <meta name="market-position" content={marketPosition} />
      
      {/* Battle Card Meta Tags */}
      <meta name="competitive-advantages" content="AI Content Generation, 70% Cost Savings, 300% Better Engagement, 10x Faster Production" />
      <meta name="pricing-advantage" content="70% cheaper than Hootsuite, 90% cheaper than Sprout Social" />
      <meta name="feature-advantage" content="AI-powered vs manual, automated vs basic, intelligent vs traditional" />
      
      {/* SERP Feature Optimization */}
      <meta name="people-also-ask" content={serpOptimization.peopleAlsoAsk.join('; ')} />
      <meta name="featured-snippet-target" content={Object.values(serpOptimization.featuredSnippets).join(' | ')} />
      
      {/* Competitor-Specific Meta Tags */}
      {targetCompetitors.includes('hootsuite') && (
        <>
          <meta name="hootsuite-alternative" content="SentientM: AI-powered, 70% cheaper, 300% better engagement than Hootsuite" />
          <meta name="hootsuite-comparison" content="SentientM vs Hootsuite: $29.99 vs $99, AI content vs manual, automated vs basic" />
        </>
      )}
      
      {targetCompetitors.includes('buffer') && (
        <>
          <meta name="buffer-alternative" content="SentientM: Advanced AI features that Buffer lacks, predictive analytics, viral optimization" />
          <meta name="buffer-comparison" content="SentientM vs Buffer: AI automation vs basic scheduling, advanced analytics vs limited insights" />
        </>
      )}
      
      {targetCompetitors.includes('sprout-social') && (
        <>
          <meta name="sprout-social-alternative" content="SentientM: 90% cost savings, AI features, accessible to SMBs unlike enterprise-only Sprout Social" />
          <meta name="sprout-social-comparison" content="SentientM vs Sprout Social: $29.99 vs $249, SMB-friendly vs enterprise-only" />
        </>
      )}
      
      {/* Competitive Intelligence Schema */}
      <script type="application/ld+json">
        {JSON.stringify(competitiveSchema)}
      </script>
      
      <script type="application/ld+json">
        {JSON.stringify(battleCardSchema)}
      </script>
      
      {/* Advanced Competitive Meta Tags */}
      <meta name="competitive-intelligence" content="market-leader-targeting" />
      <meta name="disruption-strategy" content="ai-first-approach" />
      <meta name="market-differentiation" content="artificial-intelligence, cost-efficiency, superior-engagement" />
      
      {/* Win-Loss Analysis Meta */}
      <meta name="win-reasons" content="AI features, cost savings, better results, ease of use, superior support" />
      <meta name="competitor-weaknesses" content="expensive pricing, no AI, complex interfaces, limited automation" />
      
      {/* Sales Enablement Meta */}
      <meta name="sales-messaging" content="ai-powered-advantage, cost-savings-proof, engagement-rate-superiority" />
      <meta name="objection-handling" content="feature-comparison, roi-demonstration, migration-support" />
    </Helmet>
  );
};

export default CompetitorSEO;
