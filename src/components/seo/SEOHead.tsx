import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  noIndex?: boolean;
  structuredData?: object;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title = "SentientM | #1 Sentient AI Marketing Platform | Revolutionary Social Media Automation",
  description = "Experience the future with SentientM - The world's most advanced sentient AI that revolutionizes social media marketing. Join 50,000+ businesses using sentient marketing intelligence to dominate Instagram, Twitter, Facebook & more.",
  keywords = "sentientm, sentient marketing, sentient ai, sentient social media, ai social media management, sentient automation, sentient intelligence, ai marketing platform, sentient smm, social media ai, automated marketing, sentient brand growth, instagram ai, twitter ai, facebook ai",
  canonicalUrl = "https://sentientm.com",
  ogImage = "https://sentientm.com/Logo/logo.png",
  ogType = "website",
  twitterCard = "summary_large_image",
  noIndex = false,
  structuredData
}) => {
  const robotsContent = noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:site_name" content="SentientM" />
      <meta property="og:brand" content="SentientM" />
      <meta name="twitter:domain" content="sentientm.com" />
      <meta property="og:locale" content="en_US" />
      
      {/* Twitter */}
      <meta property="twitter:card" content={twitterCard} />
      <meta property="twitter:url" content={canonicalUrl} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={ogImage} />
      <meta property="twitter:image:alt" content={title} />
      <meta property="twitter:creator" content="@sentientmarketing" />
      <meta property="twitter:site" content="@sentientmarketing" />
      
      {/* Enhanced SEO Meta Tags */}
      <meta name="brand" content="SentientM" />
      <meta name="category" content="AI Marketing Platform" />
      <meta name="coverage" content="Worldwide" />
      <meta name="target" content="all" />
      <meta name="HandheldFriendly" content="True" />
      <meta name="MobileOptimized" content="320" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      
      {/* AI and Machine Learning specific tags */}
      <meta name="ai-platform" content="true" />
      <meta name="machine-learning" content="social media automation" />
      <meta name="artificial-intelligence" content="content creation, scheduling, analytics" />
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

export default SEOHead;
