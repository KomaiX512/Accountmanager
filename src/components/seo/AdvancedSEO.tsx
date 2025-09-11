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
    const baseUrl = 'https://sentientm.com';
    const structuredDataArray = [];

    // Organization Schema
    structuredDataArray.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "SentientM",
      "alternateName": ["Sentient Marketing", "Sentient AI", "SentientM Platform"],
      "url": baseUrl,
      "logo": `${baseUrl}/Logo/logo.png`,
      "description": "World's most advanced sentient AI social media management platform that revolutionizes digital marketing with artificial intelligence across Instagram, Twitter, Facebook, and more.",
      "foundingDate": "2024",
      "industry": "Artificial Intelligence, Social Media Marketing, Digital Marketing Automation",
      "knowsAbout": ["Sentient AI", "Social Media Automation", "AI Marketing", "Content Creation AI", "Predictive Analytics"],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "email": "support@sentientm.com",
        "areaServed": "Worldwide"
      },
      "sameAs": [
        "https://twitter.com/sentientmarketing",
        "https://linkedin.com/company/sentientm",
        "https://facebook.com/sentientmarketing",
        "https://instagram.com/sentientmarketing"
      ],
      "slogan": "The Future of Sentient Marketing"
    });

    // Software Application Schema
    structuredDataArray.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "SentientM",
      "alternateName": ["Sentient Marketing Platform", "Sentient AI Platform", "SentientM AI"],
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web Browser, iOS, Android",
      "url": baseUrl,
      "description": "Revolutionary sentient AI social media management platform with advanced artificial intelligence",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
        "priceValidUntil": "2025-12-31"
      },
      "aggregateRating": reviewData ? {
        "@type": "AggregateRating",
        "ratingValue": reviewData.rating,
        "reviewCount": reviewData.reviewCount,
        "bestRating": 5,
        "worstRating": 1
      } : {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "15847",
        "bestRating": 5,
        "worstRating": 1
      },
      "featureList": [
        "Sentient AI Content Generation",
        "Multi-Platform Sentient Automation",
        "Predictive Analytics with AI",
        "Intelligent Hashtag Optimization",
        "Sentient Engagement Automation",
        "AI Brand Voice Learning",
        "Sentient Competitor Analysis",
        "Advanced Performance Tracking",
        "Instagram Sentient Automation",
        "Twitter AI Management"
      ],
      "keywords": "sentientm, sentient marketing, sentient ai, social media automation, ai marketing platform"
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
      'sentientm',
      'sentient marketing',
      'sentient ai',
      'sentient social media',
      'ai social media management',
      'sentient automation',
      'sentient intelligence',
      'ai marketing platform',
      'sentient smm',
      'social media ai',
      'automated marketing',
      'sentient brand growth',
      'instagram ai',
      'twitter ai',
      'facebook ai'
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
        title: "SentientM | #1 Sentient AI Marketing Platform | Revolutionary Social Media Automation",
        description: "Experience the future with SentientM - The world's most advanced sentient AI that revolutionizes social media marketing. Join 50,000+ businesses using sentient marketing intelligence to dominate Instagram, Twitter, Facebook & more."
      },
      platform: {
        title: `${platform?.charAt(0).toUpperCase()}${platform?.slice(1)} Sentient AI Automation - SentientM | #1 ${platform?.charAt(0).toUpperCase()}${platform?.slice(1)} Management Platform`,
        description: `Dominate ${platform} with revolutionary sentient AI automation. SentientM creates viral content, optimizes posting times, and grows your following with advanced sentient intelligence. Experience the future today!`
      },
      pricing: {
        title: "SentientM Pricing | Affordable Sentient AI Marketing Plans | Start Free Trial",
        description: "Choose the perfect sentient AI marketing plan. From free trials to enterprise solutions. Experience revolutionary sentient marketing intelligence with transparent pricing. Start your transformation today!"
      },
      blog: {
        title: "SentientM Blog | Sentient AI Marketing Insights & Revolutionary Strategies",
        description: "Expert insights on sentient AI marketing, revolutionary automation strategies, and growth tactics. Stay ahead with the latest sentient intelligence trends and best practices."
      },
      comparison: {
        title: "SentientM vs Competitors | Why We're the #1 Sentient AI Marketing Platform",
        description: "Compare SentientM with other social media tools. See why 50,000+ businesses choose our revolutionary sentient AI platform for superior automation and unprecedented results."
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
      <meta property="og:site_name" content="SentientM" />
      <meta property="og:locale" content="en_US" />
      
      {/* Twitter Card Optimization */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={optimizedTitle} />
      <meta name="twitter:description" content={optimizedDescription} />
      <meta name="twitter:creator" content="@sentientmarketing" />
      <meta name="twitter:site" content="@sentientmarketing" />
      
      {/* Advanced SEO Meta Tags */}
      <meta name="author" content="SentientM" />
      <meta name="publisher" content="SentientM" />
      <meta name="copyright" content="SentientM 2024" />
      <meta name="brand" content="SentientM" />
      <meta name="category" content="Sentient AI Marketing Platform" />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      <meta name="distribution" content="global" />
      <meta name="rating" content="general" />
      
      {/* Mobile and App Optimization */}
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="SentientM" />
      
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
