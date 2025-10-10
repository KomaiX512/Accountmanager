import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';
import { 
  FaRocket, FaStar, FaPlay, FaTrophy
} from 'react-icons/fa';

// Lazy load heavy components
const Hero3D = lazy(() => import('./Hero3D'));
const WorkflowDiagram = lazy(() => import('./WorkflowDiagram'));
const ReviewCarousel = lazy(() => import('./ReviewCarousel'));
const ComparisonTable = lazy(() => import('./ComparisonTable'));
const ThreeSteps = lazy(() => import('./ThreeSteps'));

// SEO Components (keep existing)
import SEOHead from '../seo/SEOHead';
import AdvancedSEO from '../seo/AdvancedSEO';
import ContentOptimizer from '../seo/ContentOptimizer';
import PerformanceOptimizer from '../seo/PerformanceOptimizer';
import BillionDollarSEO from '../seo/BillionDollarSEO';
import SemanticSEO from '../seo/SemanticSEO';
import TechnicalSEO from '../seo/TechnicalSEO';
import CompetitorSEO from '../seo/CompetitorSEO';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger, TextPlugin);

// Particle System Component
const ParticleField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      opacity: number;
    }> = [];

    // Create particles
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 204, ${particle.opacity})`;
        ctx.fill();
      });
      
      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(0, 255, 204, ${0.1 * (1 - distance / 100)})`;
            ctx.stroke();
          }
        });
      });
      
      requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
};

// Animated Counter Component
const AnimatedCounter: React.FC<{ end: number; suffix?: string; prefix?: string }> = ({ end, suffix = '', prefix = '' }) => {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView({ triggerOnce: true });

  useEffect(() => {
    if (!inView) return;

    let start = 0;
    const duration = 2000;
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [end, inView]);

  return (
    <span ref={ref}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
};

// Morphing Text Component
const MorphingText: React.FC<{ texts: string[] }> = ({ texts }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [texts]);

  useEffect(() => {
    if (!textRef.current) return;

    gsap.to(textRef.current, {
      text: texts[currentIndex],
      duration: 1,
      ease: 'power2.inOut'
    });
  }, [currentIndex, texts]);

  return <span ref={textRef} className="morphing-text">{texts[0]}</span>;
};

const HomepageEnhanced: React.FC = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const { scrollYProgress } = useScroll();
  
  // Parallax transforms
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -300]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Animated text variations
  const heroTexts = [
    "AI Marketing Manager",
    "Content Creator",
    "Growth Hacker",
    "Social Media Expert",
    "Brand Builder"
  ];

  return (
    <>
      {/* SEO Components */}
      <SEOHead 
        title="SentientM | #1 AI Social Media Management Platform | Trillion Dollar Technology"
        description="Revolutionary AI that transforms your social media with sentient intelligence. Join 50,000+ businesses experiencing 300% growth. From $0 to trillion-dollar technology."
        keywords="sentientm, sentient marketing, ai social media management, social media automation, trillion dollar technology"
        canonicalUrl="https://sentientm.com/"
      />
      
      <BillionDollarSEO 
        pageType="homepage"
        targetKeywords={['sentient marketing', 'ai social media management', 'social media automation']}
        semanticCluster="intelligence"
        competitorTarget="hootsuite"
        industryFocus="ecommerce"
      />
      
      <SemanticSEO 
        content={{
          mainTopic: "AI Social Media Management",
          subtopics: ["Content Automation", "Predictive Analytics", "Brand Voice Learning"],
          entities: ["SentientM", "Artificial Intelligence", "Social Media Marketing"],
          semanticKeywords: ["ai automation", "social media intelligence", "predictive marketing"],
          contentClusters: ["automation", "intelligence", "efficiency", "performance"]
        }}
        pageContext="homepage"
        targetAudience="business-owners"
        competitorContext={['hootsuite', 'buffer', 'sprout-social']}
      />
      
      <TechnicalSEO 
        pageType="homepage"
        criticalResources={['/api/dashboard', '/api/user/profile']}
        imageOptimization={true}
        coreWebVitalsOptimization={true}
      />
      
      <CompetitorSEO 
        targetCompetitors={['hootsuite', 'buffer', 'sprout-social']}
        competitiveKeywords={['hootsuite alternative', 'buffer alternative']}
        marketPosition="disruptor"
      />

      {/* Main Homepage */}
      <div className="homepage-enhanced">
        {/* Particle Background */}
        <ParticleField />

        {/* Hero Section with 3D */}
        <motion.section 
          className="hero-enhanced"
          style={{ y: heroY, scale: heroScale, opacity: heroOpacity }}
        >
          <div className="hero-3d-wrapper">
            <Suspense fallback={
              <div className="loading-3d">
                <div className="spinner" />
              </div>
            }>
              <Hero3D mousePosition={mousePosition} />
            </Suspense>
          </div>

          <motion.div 
            className="hero-content"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            <motion.div
              className="hero-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <FaTrophy /> #1 AI Platform
            </motion.div>

            <h1 className="hero-title-enhanced">
              <span className="title-line">Your</span>
              <span className="title-highlight">
                <MorphingText texts={heroTexts} />
              </span>
              <span className="title-line">That Never Sleeps</span>
            </h1>

            <p className="hero-subtitle-enhanced">
              Transform your social media with sentient AI technology.
              <br />
              <AnimatedCounter end={50000} suffix="+" /> businesses growing automatically.
            </p>

            <div className="hero-stats">
              <div className="stat-item">
                <AnimatedCounter end={300} suffix="%" prefix="+" />
                <span>Growth Rate</span>
              </div>
              <div className="stat-item">
                <AnimatedCounter end={10} suffix="x" />
                <span>ROI Increase</span>
              </div>
              <div className="stat-item">
                <AnimatedCounter end={247} suffix="" />
                <span>24/7 Active</span>
              </div>
            </div>

            <motion.div 
              className="hero-cta-group"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              <motion.button
                className="cta-primary"
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(0,255,204,0.3)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => window.location.href = '/account'}
              >
                <FaRocket /> Start Free Trial
                <motion.span
                  className="cta-glow"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
              </motion.button>

              <motion.button
                className="cta-secondary"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FaPlay /> Watch Demo
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Floating social proof */}
          <motion.div 
            className="floating-social-proof"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
          >
            <div className="proof-avatars">
              {['👨‍💼', '👩‍💻', '👨‍🎨', '👩‍🚀', '👨‍🏫'].map((emoji, i) => (
                <span key={i} className="avatar" style={{ zIndex: 5 - i }}>
                  {emoji}
                </span>
              ))}
            </div>
            <div className="proof-text">
              <strong>50,000+</strong> happy users
              <div className="stars">
                {[...Array(5)].map((_, i) => <FaStar key={i} />)}
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* Three Steps Section */}
        <Suspense fallback={<div className="section-loading" />}>
          <ThreeSteps />
        </Suspense>

        {/* Workflow Diagram */}
        <Suspense fallback={<div className="section-loading" />}>
          <WorkflowDiagram />
        </Suspense>

        {/* Review Carousel */}
        <Suspense fallback={<div className="section-loading" />}>
          <ReviewCarousel />
        </Suspense>

        {/* Comparison Table */}
        <Suspense fallback={<div className="section-loading" />}>
          <ComparisonTable />
        </Suspense>

        {/* Keep existing sections but enhanced... */}
        {/* Add more sections as needed */}
      </div>
    </>
  );
};

export default HomepageEnhanced;
