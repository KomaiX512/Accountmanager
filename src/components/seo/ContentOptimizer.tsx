import React from 'react';
import { Helmet } from 'react-helmet-async';

interface ContentOptimizerProps {
  pageContent: {
    h1: string;
    h2s: string[];
    keyPoints: string[];
    targetKeywords: string[];
    competitorKeywords?: string[];
  };
  aiOverviewOptimization?: {
    quickAnswer: string;
    bulletPoints: string[];
    tableData?: Array<{feature: string; description: string}>;
  };
}

const ContentOptimizer: React.FC<ContentOptimizerProps> = ({
  pageContent,
  aiOverviewOptimization
}) => {
  
  // Generate AI Overview optimized content structure
  const generateAIOptimizedStructure = () => {
    if (!aiOverviewOptimization) return null;

    return {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": [".ai-answer", ".key-features", ".quick-summary"]
      },
      "mainEntity": {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is Sentient Marketing?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": aiOverviewOptimization.quickAnswer
            }
          },
          {
            "@type": "Question", 
            "name": "How does AI social media management work?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sentient Marketing uses advanced AI algorithms to analyze your brand voice, create personalized content, optimize posting times, and automate engagement across Instagram, Twitter, Facebook, and other platforms."
            }
          },
          {
            "@type": "Question",
            "name": "What platforms does Sentient Marketing support?",
            "acceptedAnswer": {
              "@type": "Answer", 
              "text": "Sentient Marketing supports Instagram, Twitter, Facebook, LinkedIn, TikTok, and YouTube with full automation capabilities including content creation, scheduling, hashtag optimization, and analytics."
            }
          }
        ]
      }
    };
  };

  // Generate How-To Schema for tutorials
  const generateHowToSchema = () => {
    return {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": "How to Automate Social Media with AI",
      "description": "Step-by-step guide to automating your social media marketing using Sentient Marketing's AI platform",
      "totalTime": "PT10M",
      "supply": [
        {
          "@type": "HowToSupply",
          "name": "Social Media Accounts"
        },
        {
          "@type": "HowToSupply", 
          "name": "Sentient Marketing Account"
        }
      ],
      "step": [
        {
          "@type": "HowToStep",
          "name": "Connect Your Accounts",
          "text": "Link your Instagram, Twitter, and Facebook accounts to Sentient Marketing platform",
          "url": "https://sentientmarketing.com/connect"
        },
        {
          "@type": "HowToStep",
          "name": "Set Your Brand Voice",
          "text": "Configure AI to learn your unique brand voice and content style preferences",
          "url": "https://sentientmarketing.com/brand-voice"
        },
        {
          "@type": "HowToStep",
          "name": "Enable Auto-Posting",
          "text": "Activate AI-powered content creation and automated posting schedules",
          "url": "https://sentientmarketing.com/automation"
        }
      ]
    };
  };

  // Generate Product Schema for better SERP features
  const generateProductSchema = () => {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Sentient Marketing AI Platform",
      "description": "AI-powered social media management platform that automates content creation, scheduling, and analytics",
      "brand": {
        "@type": "Brand",
        "name": "Sentient Marketing"
      },
      "category": "Software > Business Software > Marketing Software",
      "offers": {
        "@type": "Offer",
        "price": "29.99",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
        "priceValidUntil": "2025-12-31",
        "seller": {
          "@type": "Organization",
          "name": "Sentient Marketing"
        }
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "reviewCount": "1247",
        "bestRating": "5",
        "worstRating": "1"
      },
      "review": [
        {
          "@type": "Review",
          "author": {
            "@type": "Person",
            "name": "Sarah Johnson"
          },
          "reviewRating": {
            "@type": "Rating",
            "ratingValue": "5"
          },
          "reviewBody": "Sentient Marketing transformed our social media strategy. The AI creates content that perfectly matches our brand voice and our engagement has increased 300%."
        }
      ]
    };
  };

  // Generate competitive advantage schema
  const generateCompetitiveSchema = () => {
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Why Choose Sentient Marketing Over Competitors",
      "description": "Key advantages of Sentient Marketing compared to other social media management tools",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Advanced AI Content Generation",
          "description": "Creates human-like content that matches your brand voice perfectly"
        },
        {
          "@type": "ListItem", 
          "position": 2,
          "name": "Multi-Platform Automation",
          "description": "Seamlessly manages Instagram, Twitter, Facebook, LinkedIn, and TikTok from one dashboard"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Real-Time Analytics & Optimization",
          "description": "AI continuously learns and optimizes posting times, hashtags, and content for maximum engagement"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Affordable Enterprise Features",
          "description": "Get enterprise-level automation at a fraction of the cost of competitors like Hootsuite or Buffer"
        }
      ]
    };
  };

  const aiOptimizedStructure = generateAIOptimizedStructure();
  const howToSchema = generateHowToSchema();
  const productSchema = generateProductSchema();
  const competitiveSchema = generateCompetitiveSchema();

  return (
    <Helmet>
      {/* AI Overview Optimization Meta Tags */}
      <meta name="description" content={aiOverviewOptimization?.quickAnswer || pageContent.keyPoints.join('. ')} />
      
      {/* Featured Snippet Optimization */}
      <meta name="snippet-target" content={aiOverviewOptimization?.quickAnswer} />
      
      {/* Voice Search Optimization */}
      <meta name="speakable" content="true" />
      
      {/* Entity Recognition */}
      <meta name="entity" content="Sentient Marketing" />
      <meta name="entity-type" content="SoftwareApplication" />
      
      {/* Topical Authority Tags */}
      <meta name="topic" content="AI Social Media Management" />
      <meta name="subtopic" content="Social Media Automation, Content Creation, Marketing Analytics" />
      
      {/* Competitive Keywords */}
      <meta name="competitive-keywords" content="hootsuite alternative, buffer alternative, sprout social alternative, ai social media tool" />
      
      {/* Structured Data Schemas */}
      {aiOptimizedStructure && (
        <script type="application/ld+json">
          {JSON.stringify(aiOptimizedStructure)}
        </script>
      )}
      
      <script type="application/ld+json">
        {JSON.stringify(howToSchema)}
      </script>
      
      <script type="application/ld+json">
        {JSON.stringify(productSchema)}
      </script>
      
      <script type="application/ld+json">
        {JSON.stringify(competitiveSchema)}
      </script>
      
      {/* Table Data Schema for AI Overviews */}
      {aiOverviewOptimization?.tableData && (
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Table",
            "about": "Sentient Marketing Features Comparison",
            "description": "Comprehensive comparison of Sentient Marketing features and capabilities"
          })}
        </script>
      )}
    </Helmet>
  );
};

export default ContentOptimizer;
