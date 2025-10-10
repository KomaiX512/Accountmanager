import React, { useEffect, useRef, useState } from 'react';
import './PremiumCursor.css';

const PremiumCursor: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const rippleContainerRef = useRef<HTMLDivElement>(null);
  const [isPointer, setIsPointer] = useState(false);
  
  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    const speed = 0.5; // Increased from 0.15 for instant, natural response
    let lastRippleTime = 0;
    const rippleThrottle = 100; // Only create ripple every 100ms

    const animateCursor = () => {
      const distX = mouseX - cursorX;
      const distY = mouseY - cursorY;
      
      cursorX += distX * speed;
      cursorY += distY * speed;
      
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
      }
      
      if (cursorDotRef.current) {
        cursorDotRef.current.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
      }
      
      requestAnimationFrame(animateCursor);
    };
    
    animateCursor();

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      
      // Throttled ripple effect for better performance
      const now = Date.now();
      if (rippleContainerRef.current && now - lastRippleTime > rippleThrottle) {
        lastRippleTime = now;
        const ripple = document.createElement('div');
        ripple.className = 'cursor-ripple';
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        rippleContainerRef.current.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
        }, 800);
      }
      
      // Check if hovering over interactive element
      const target = e.target as HTMLElement;
      const isInteractive = 
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.closest('a') !== null ||
        target.closest('button') !== null ||
        target.classList.contains('interactive-element') ||
        target.closest('.interactive-element') !== null;
      
      setIsPointer(isInteractive);
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <>
      <div ref={rippleContainerRef} className="ripple-container" />
      <div 
        ref={cursorRef} 
        className={`premium-cursor ${isPointer ? 'is-pointer' : ''}`}
      >
        <div className="cursor-ring" />
      </div>
      <div 
        ref={cursorDotRef} 
        className="premium-cursor-dot"
      />
    </>
  );
};

export default PremiumCursor;
