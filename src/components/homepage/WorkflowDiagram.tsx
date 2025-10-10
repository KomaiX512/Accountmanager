import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const WorkflowDiagram: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    // Animate data flow particles
    const particles = svg.querySelectorAll('.data-particle');
    const paths = svg.querySelectorAll('.flow-path');

    // Create timeline for workflow animation
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: container,
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 1,
        pin: false,
      },
    });

    // Animate paths drawing
    paths.forEach((path) => {
      const length = (path as SVGPathElement).getTotalLength();
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });
      
      tl.to(path, {
        strokeDashoffset: 0,
        duration: 2,
        ease: 'power2.inOut',
      }, '<0.1');
    });

    // Animate particles along paths
    particles.forEach((particle, index) => {
      tl.to(particle, {
        motionPath: {
          path: paths[index % paths.length] as SVGPathElement,
          align: paths[index % paths.length] as SVGPathElement,
          autoRotate: true,
        },
        duration: 3,
        repeat: -1,
        ease: 'none',
      }, '<');
    });

    // Animate boxes
    const boxes = svg.querySelectorAll('.workflow-box');
    boxes.forEach((box, index) => {
      tl.from(box, {
        scale: 0,
        opacity: 0,
        duration: 0.5,
        delay: index * 0.1,
        ease: 'back.out(1.7)',
      }, '<0.1');
    });

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, []);

  return (
    <div ref={containerRef} className="workflow-container">
      <motion.h2 
        className="workflow-title"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        How We Transform Your Social Media
      </motion.h2>
      
      <svg 
        ref={svgRef}
        className="workflow-svg"
        viewBox="0 0 1200 600" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00ffcc" stopOpacity="1" />
            <stop offset="100%" stopColor="#0099ff" stopOpacity="1" />
          </linearGradient>
          
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* User Account Input */}
        <g className="workflow-box">
          <rect x="50" y="250" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="125" y="290" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">Your Account</text>
          <text x="125" y="320" textAnchor="middle" fill="white" fontSize="14">@username</text>
        </g>

        {/* Data Extraction */}
        <g className="workflow-box">
          <rect x="300" y="150" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="375" y="190" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">Data Extraction</text>
          <text x="375" y="220" textAnchor="middle" fill="white" fontSize="14">Profile Analysis</text>
        </g>

        {/* R2 Buckets Storage */}
        <g className="workflow-box">
          <rect x="300" y="350" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="375" y="390" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">R2 Storage</text>
          <text x="375" y="420" textAnchor="middle" fill="white" fontSize="14">Secure Buckets</text>
        </g>

        {/* RAG Processing */}
        <g className="workflow-box">
          <rect x="550" y="250" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="625" y="290" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">RAG Engine</text>
          <text x="625" y="320" textAnchor="middle" fill="white" fontSize="14">AI Processing</text>
        </g>

        {/* Content Generation */}
        <g className="workflow-box">
          <rect x="800" y="150" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="875" y="190" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">Content Creation</text>
          <text x="875" y="220" textAnchor="middle" fill="white" fontSize="14">AI Generated</text>
        </g>

        {/* Automated Posting */}
        <g className="workflow-box">
          <rect x="800" y="350" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="875" y="390" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">Auto Posting</text>
          <text x="875" y="420" textAnchor="middle" fill="white" fontSize="14">Scheduled</text>
        </g>

        {/* Growth Result */}
        <g className="workflow-box">
          <rect x="1000" y="250" width="150" height="100" rx="10" fill="rgba(0,255,204,0.1)" stroke="url(#gradient1)" strokeWidth="2" filter="url(#glow)"/>
          <text x="1075" y="290" textAnchor="middle" fill="#00ffcc" fontSize="16" fontWeight="600">Growth</text>
          <text x="1075" y="320" textAnchor="middle" fill="white" fontSize="14">📈 300%</text>
        </g>

        {/* Flow paths */}
        <path className="flow-path" d="M 200 300 Q 250 200 300 200" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 200 300 Q 250 400 300 400" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 450 200 L 550 280" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 450 400 L 550 320" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 700 280 Q 750 200 800 200" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 700 320 Q 750 400 800 400" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 950 200 L 1000 280" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>
        <path className="flow-path" d="M 950 400 L 1000 320" fill="none" stroke="url(#gradient1)" strokeWidth="2" opacity="0.5"/>

        {/* Data particles */}
        <circle className="data-particle" r="5" fill="#00ffcc">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle className="data-particle" r="5" fill="#0099ff">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle className="data-particle" r="5" fill="#00ffcc">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
        </circle>
      </svg>
    </div>
  );
};

export default WorkflowDiagram;
