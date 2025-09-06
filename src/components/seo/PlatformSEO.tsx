import React from 'react';
import SEOHead from './SEOHead';

interface PlatformSEOProps {
  platform: 'instagram' | 'twitter' | 'facebook';
}

const PlatformSEO: React.FC<PlatformSEOProps> = ({ platform }) => {
  const platformData = {
    instagram: {
      title: "Instagram Marketing Automation - AI-Powered Content Creation | Sentient Marketing",
      description: "Automate your Instagram marketing with AI-powered content creation, scheduling, and analytics. Grow your Instagram presence with intelligent automation and data-driven insights.",
      keywords: "Instagram automation, Instagram marketing, Instagram AI, Instagram content creation, Instagram scheduling, Instagram analytics, Instagram growth, social media automation",
      canonicalUrl: "https://sentientmarketing.com/instagram",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Instagram Marketing Automation - Sentient Marketing",
        "description": "Automate your Instagram marketing with AI-powered content creation, scheduling, and analytics.",
        "url": "https://sentientmarketing.com/instagram",
        "mainEntity": {
          "@type": "SoftwareApplication",
          "name": "Instagram Marketing Automation",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web Browser",
          "featureList": [
            "Instagram content creation",
            "Automated posting",
            "Hashtag optimization",
            "Engagement analytics",
            "Story automation",
            "Reel optimization"
          ]
        }
      }
    },
    twitter: {
      title: "Twitter Marketing Automation - AI-Powered Twitter Management | Sentient Marketing",
      description: "Transform your Twitter presence with AI-powered content creation, automated tweeting, and advanced analytics. Maximize engagement and grow your Twitter following intelligently.",
      keywords: "Twitter automation, Twitter marketing, Twitter AI, Twitter content creation, Twitter scheduling, Twitter analytics, Twitter growth, social media automation",
      canonicalUrl: "https://sentientmarketing.com/twitter",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Twitter Marketing Automation - Sentient Marketing",
        "description": "Transform your Twitter presence with AI-powered content creation, automated tweeting, and advanced analytics.",
        "url": "https://sentientmarketing.com/twitter",
        "mainEntity": {
          "@type": "SoftwareApplication",
          "name": "Twitter Marketing Automation",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web Browser",
          "featureList": [
            "Twitter content creation",
            "Automated tweeting",
            "Thread optimization",
            "Engagement tracking",
            "Trend analysis",
            "Hashtag research"
          ]
        }
      }
    },
    facebook: {
      title: "Facebook Marketing Automation - AI-Powered Facebook Management | Sentient Marketing",
      description: "Automate your Facebook marketing with AI-powered content creation, post scheduling, and comprehensive analytics. Boost your Facebook page engagement and reach.",
      keywords: "Facebook automation, Facebook marketing, Facebook AI, Facebook content creation, Facebook scheduling, Facebook analytics, Facebook growth, social media automation",
      canonicalUrl: "https://sentientmarketing.com/facebook",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Facebook Marketing Automation - Sentient Marketing",
        "description": "Automate your Facebook marketing with AI-powered content creation, post scheduling, and comprehensive analytics.",
        "url": "https://sentientmarketing.com/facebook",
        "mainEntity": {
          "@type": "SoftwareApplication",
          "name": "Facebook Marketing Automation",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web Browser",
          "featureList": [
            "Facebook content creation",
            "Automated posting",
            "Page optimization",
            "Engagement analytics",
            "Ad content generation",
            "Audience insights"
          ]
        }
      }
    }
  };

  const data = platformData[platform];

  return (
    <SEOHead
      title={data.title}
      description={data.description}
      keywords={data.keywords}
      canonicalUrl={data.canonicalUrl}
      structuredData={data.structuredData}
    />
  );
};

export default PlatformSEO;
