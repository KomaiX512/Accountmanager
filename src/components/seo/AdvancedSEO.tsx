import React from 'react';
import { Helmet } from 'react-helmet-async';

interface AdvancedSEOProps {
  pageType: 'homepage' | 'platform' | 'pricing' | 'blog' | 'comparison';
  platform?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  faqData?: Array<{question: string; answer: string}>;
  breadcrumbs?: Array<{name: string; url: string}>;
  reviewData?: {
    rating: number;
    reviewCount: number;
    reviews?: Array<{author: string; rating: number; text: string}>;
  };
  videoData?: {
    name: string;
    description: string;
    thumbnailUrl: string;
    uploadDate: string;
    duration: string;
  };
}

const AdvancedSEO: React.FC<AdvancedSEOProps> = ({
  pageType,
  platform,
  title,
  description,
  keywords = [],
  faqData,
  breadcrumbs,
  reviewData,
  videoData
}) => {
  
  // Generate comprehensive structured data based on page type
  const generateStructuredData = () => {
    const baseUrl = 'https://sentientmarketing.com';
    const structuredDataArray = [];

    // Organization Schema
    structuredDataArray.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Sentient Marketing",
      "url": baseUrl,
      "logo": `${baseUrl}/Logo/logo.png`,
      "description": "AI-powered social media management platform that automates content creation, scheduling, and analytics across Instagram, Twitter, Facebook, and more.",
      "foundingDate": "2024",
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "email": "support@sentientmarketing.com"
      },
      "sameAs": [
        "https://twitter.com/sentientmarketing",
        "https://linkedin.com/company/sentientmarketing"
      ]
    });

    // Software Application Schema
    structuredDataArray.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Sentient Marketing Platform",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web Browser, iOS, Android",
      "offers": {
        "@type": "Offer",
        "price": "29.99",
        "priceCurrency": "USD",
        "priceValidUntil": "2025-12-31"
      },
      "aggregateRating": reviewData ? {
        "@type": "AggregateRating",
        "ratingValue": reviewData.rating,
        "reviewCount": reviewData.reviewCount,
        "bestRating": 5,
        "worstRating": 1
      } : undefined,
      "featureList": [
        "AI Content Generation",
        "Multi-Platform Scheduling",
        "Advanced Analytics",
        "Hashtag Optimization",
        "Engagement Automation",
        "Brand Voice Learning",
        "Competitor Analysis",
        "Performance Tracking"
      ]
    });

    // FAQ Schema
    if (faqData && faqData.length > 0) {
      structuredDataArray.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqData.map(faq => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer
          }
        }))
      });
    }

    // Breadcrumb Schema
    if (breadcrumbs && breadcrumbs.length > 0) {
      structuredDataArray.push({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbs.map((crumb, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": crumb.name,
          "item": `${baseUrl}${crumb.url}`
        }))
      });
    }

    // Video Schema
    if (videoData) {
      structuredDataArray.push({
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": videoData.name,
        "description": videoData.description,
        "thumbnailUrl": videoData.thumbnailUrl,
        "uploadDate": videoData.uploadDate,
        "duration": videoData.duration,
        "contentUrl": `${baseUrl}/videos/${platform || 'demo'}.mp4`
      });
    }

    // Review Schema
    if (reviewData && reviewData.reviews) {
      reviewData.reviews.forEach(review => {
        structuredDataArray.push({
          "@context": "https://schema.org",
          "@type": "Review",
          "itemReviewed": {
            "@type": "SoftwareApplication",
            "name": "Sentient Marketing Platform"
          },
          "author": {
            "@type": "Person",
            "name": review.author
          },
          "reviewRating": {
            "@type": "Rating",
            "ratingValue": review.rating,
            "bestRating": 5
          },
          "reviewBody": review.text
        });
      });
    }

    return structuredDataArray;
  };

  // Generate optimized meta keywords
  const generateKeywords = () => {
    const baseKeywords = [
      'sentient marketing',
      'AI social media management',
      'social media automation',
      'AI marketing platform',
      'automated content creation',
      'social media scheduling',
      'AI-powered marketing'
    ];

    if (platform) {
      baseKeywords.push(
        `${platform} automation`,
        `${platform} AI`,
        `${platform} marketing`,
        `${platform} content creation`
      );
    }

    return [...baseKeywords, ...keywords].join(', ');
  };

  // Generate AI-optimized title and description
  const getOptimizedContent = () => {
    const defaults = {
      homepage: {
        title: "Sentient Marketing - #1 AI Social Media Management Platform | Automate Instagram, Twitter & Facebook",
        description: "Transform your social media with AI that thinks and learns. Automate content creation, scheduling, and analytics across all platforms. Start your free trial today!"
      },
      platform: {
        title: `${platform?.charAt(0).toUpperCase()}${platform?.slice(1)} AI Automation - Sentient Marketing | #1 ${platform?.charAt(0).toUpperCase()}${platform?.slice(1)} Management Tool`,
        description: `Dominate ${platform} with AI-powered automation. Create viral content, optimize posting times, and grow your following 10x faster. Free trial available!`
      },
      pricing: {
        title: "Sentient Marketing Pricing - Affordable AI Social Media Management Plans | Start Free",
        description: "Choose the perfect AI social media management plan. From free trials to enterprise solutions. Transparent pricing, no hidden fees. Start automating today!"
      },
      blog: {
        title: "Sentient Marketing Blog - AI Social Media Marketing Insights & Strategies",
        description: "Expert insights on AI-powered social media marketing, automation strategies, and growth tactics. Stay ahead with the latest trends and best practices."
      },
      comparison: {
        title: "Sentient Marketing vs Competitors - Why We're the #1 AI Social Media Platform",
        description: "Compare Sentient Marketing with other social media tools. See why thousands choose our AI-powered platform for superior automation and results."
      }
    };

    return {
      title: title || defaults[pageType]?.title || defaults.homepage.title,
      description: description || defaults[pageType]?.description || defaults.homepage.description
    };
  };

  const { title: optimizedTitle, description: optimizedDescription } = getOptimizedContent();
  const structuredData = generateStructuredData();

  return (
    <Helmet>
      {/* Enhanced Meta Tags for AI Overviews */}
      <title>{optimizedTitle}</title>
      <meta name="title" content={optimizedTitle} />
      <meta name="description" content={optimizedDescription} />
      <meta name="keywords" content={generateKeywords()} />
      
      {/* AI Search Optimization */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="bingbot" content="index, follow" />
      
      {/* Enhanced Open Graph for Social Sharing */}
      <meta property="og:title" content={optimizedTitle} />
      <meta property="og:description" content={optimizedDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Sentient Marketing" />
      <meta property="og:locale" content="en_US" />
      
      {/* Twitter Card Optimization */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={optimizedTitle} />
      <meta name="twitter:description" content={optimizedDescription} />
      <meta name="twitter:creator" content="@sentientmarketing" />
      <meta name="twitter:site" content="@sentientmarketing" />
      
      {/* Advanced SEO Meta Tags */}
      <meta name="author" content="Sentient Marketing" />
      <meta name="publisher" content="Sentient Marketing" />
      <meta name="copyright" content="Sentient Marketing 2024" />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      <meta name="distribution" content="global" />
      <meta name="rating" content="general" />
      
      {/* Mobile and App Optimization */}
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="Sentient Marketing" />
      
      {/* Structured Data */}
      {structuredData.map((data, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(data)}
        </script>
      ))}
      
      {/* Preconnect to External Domains */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://www.google-analytics.com" />
      
      {/* DNS Prefetch for Performance */}
      <link rel="dns-prefetch" href="//fonts.googleapis.com" />
      <link rel="dns-prefetch" href="//www.google-analytics.com" />
      <link rel="dns-prefetch" href="//www.googletagmanager.com" />
    </Helmet>
  );
};

export default AdvancedSEO;
