/**
 * Console error suppression for development
 * Reduces noise from known issues while preserving important errors
 */

// Store original console methods
const originalWarn = console.warn;
const originalError = console.error;

// Patterns to suppress (but still log once with count)
const suppressedPatterns = [
  /API response is not an array:/,
  /Error in parsing value for 'opacity'.*Declaration dropped/,
  /React Router Future Flag Warning/,
  /The resource.*preloaded.*not used within a few seconds/,
  /Ruleset ignored due to bad selector/,
  /No competitor data found for/,
  /Image failed to load.*proxy-image/
];

// Track suppressed messages
const suppressedCounts = new Map<string, number>();

function shouldSuppress(message: string): boolean {
  return suppressedPatterns.some(pattern => pattern.test(message));
}

function getMessageKey(args: any[]): string {
  return args.join(' ').substring(0, 100);
}

// Enhanced console.warn
console.warn = function(...args: any[]) {
  const message = args.join(' ');
  const key = getMessageKey(args);
  
  if (shouldSuppress(message)) {
    const count = suppressedCounts.get(key) || 0;
    suppressedCounts.set(key, count + 1);
    
    // Only log the first occurrence with suppression notice
    if (count === 0) {
      originalWarn.apply(console, [...args, '(further identical warnings suppressed)']);
    }
    return;
  }
  
  originalWarn.apply(console, args);
};

// Enhanced console.error  
console.error = function(...args: any[]) {
  const message = args.join(' ');
  const key = getMessageKey(args);
  
  if (shouldSuppress(message)) {
    const count = suppressedCounts.get(key) || 0;
    suppressedCounts.set(key, count + 1);
    
    // Only log the first occurrence with suppression notice
    if (count === 0) {
      originalError.apply(console, [...args, '(further identical errors suppressed)']);
    }
    return;
  }
  
  originalError.apply(console, args);
};

// Log suppressed counts periodically in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    if (suppressedCounts.size > 0) {
      console.info('📊 Suppressed console messages:', Object.fromEntries(suppressedCounts));
    }
  }, 30000); // Every 30 seconds
}

export {};
