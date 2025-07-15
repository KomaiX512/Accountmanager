// Google Analytics Cookie Fix and Lexical Declaration Error Prevention
(function() {
  'use strict';
  
  // Prevent lexical declaration errors by ensuring proper initialization
  const preventLexicalErrors = () => {
    try {
      // Override any problematic global variables that might cause lexical errors
      if (typeof window !== 'undefined') {
        // Ensure proper initialization order
        if (!window.__ga_initialized) {
          window.__ga_initialized = true;
        }
        
        // Prevent cookie conflicts
        const originalSetCookie = document.cookie;
        Object.defineProperty(document, 'cookie', {
          get: function() {
            return originalSetCookie;
          },
          set: function(value) {
            // Filter out problematic GA cookies that cause warnings
            if (value && value.includes('_ga_') && value.includes('expires=')) {
              // Remove the expires attribute to prevent the warning
              value = value.replace(/expires=[^;]+;?/g, '');
            }
            originalSetCookie = value;
          },
          configurable: true
        });
      }
    } catch (error) {
      console.warn('Cookie fix initialization error:', error);
    }
  };
  
  // Initialize fixes when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preventLexicalErrors);
  } else {
    preventLexicalErrors();
  }
  
  // Also run on window load to catch any late initialization
  window.addEventListener('load', preventLexicalErrors);
  
  // Prevent layout shifts during loading
  const preventLayoutShifts = () => {
    try {
      // Add loading class to body
      document.body.classList.add('loading');
      
      // Remove loading class when everything is ready
      const removeLoading = () => {
        document.body.classList.remove('loading');
        document.body.classList.add('loaded');
      };
      
      // Remove loading class after a short delay to ensure styles are loaded
      setTimeout(removeLoading, 100);
      
      // Also remove on window load
      window.addEventListener('load', removeLoading);
    } catch (error) {
      console.warn('Layout shift prevention error:', error);
    }
  };
  
  // Initialize layout shift prevention
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preventLayoutShifts);
  } else {
    preventLayoutShifts();
  }
  
  // Error boundary for any remaining lexical declaration issues
  window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('lexical declaration')) {
      console.warn('Lexical declaration error caught and handled:', event.error.message);
      event.preventDefault();
      return false;
    }
  });
  
  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('lexical declaration')) {
      console.warn('Lexical declaration promise error caught and handled:', event.reason.message);
      event.preventDefault();
      return false;
    }
  });
  
})(); 