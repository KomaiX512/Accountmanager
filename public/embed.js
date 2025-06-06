// R2 Image Fixer - Embed Version
// Add this script to any page that needs to load R2 images
(function() {
  console.log("R2 Image Fixer - Embed Version");
  
  // Detect current host for proxy
  const host = window.location.hostname === 'localhost' ? 'localhost:3002' : window.location.host;
  const protocol = window.location.protocol || 'https:';
  
  // Define problematic image patterns
  const PROBLEMATIC_PATTERNS = [
    'narsissist/image_1749203937329.jpg',
    'r2.cloudflarestorage.com',
    'r2.dev',
    'tasks.b21d96e73b908d7d7b822d41516ccc64',
    'pub-ba72672df3c041a3844f278dd3c32b22'
  ];
  
  // Function to check if a URL matches any problematic pattern
  function isProblematicUrl(url) {
    if (!url) return false;
    return PROBLEMATIC_PATTERNS.some(pattern => url.includes(pattern));
  }
  
  // Function to convert problematic URLs to our proxy
  function fixImageUrl(url) {
    // Handle the specific problematic URL
    if (url.includes('narsissist') && url.includes('image_1749203937329.jpg')) {
      return `${protocol}//${host}/fix-image/narsissist/image_1749203937329.jpg?platform=instagram`;
    }
    
    // Try to extract username and filename for other URLs
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Look for username in path
      let username = null;
      let filename = null;
      
      // Check common usernames
      const commonUsernames = ['narsissist', 'toofaced', 'maccosmetics', 'maybelline'];
      for (const name of commonUsernames) {
        if (url.includes('/' + name + '/')) {
          username = name;
          
          // Look for image filename after username
          const nameIndex = pathParts.indexOf(name);
          if (nameIndex >= 0 && nameIndex + 1 < pathParts.length) {
            // Try to find a .jpg file
            for (let i = nameIndex + 1; i < pathParts.length; i++) {
              if (pathParts[i].endsWith('.jpg')) {
                filename = pathParts[i];
                break;
              }
            }
          }
          break;
        }
      }
      
      if (username && filename) {
        return `${protocol}//${host}/fix-image/${username}/${filename}?platform=instagram`;
      }
    } catch (error) {
      console.error('Error parsing URL:', error);
    }
    
    // Default fallback
    return `${protocol}//${host}/placeholder.jpg?src=${encodeURIComponent(url)}`;
  }
  
  // Function to fix all images on the page
  function fixImages() {
    document.querySelectorAll('img').forEach(img => {
      if (isProblematicUrl(img.src)) {
        const originalSrc = img.src;
        const fixedSrc = fixImageUrl(originalSrc);
        console.log(`R2 Fixer - Replacing: ${originalSrc} → ${fixedSrc}`);
        img.src = fixedSrc;
      }
    });
  }
  
  // Fix images when they fail to load
  document.addEventListener('error', event => {
    const target = event.target;
    if (target.tagName === 'IMG') {
      // Log the error
      console.log(`R2 Fixer - Image load error: ${target.src}`);
      
      if (isProblematicUrl(target.src)) {
        event.preventDefault();
        
        const fixedUrl = fixImageUrl(target.src);
        console.log(`R2 Fixer - Replacing with: ${fixedUrl}`);
        target.src = fixedUrl;
      }
    }
  }, true);
  
  // Watch for DOM changes to fix new images
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length) {
        fixImages();
      }
    });
  });
  
  // Start observing
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Fix images on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixImages);
  } else {
    fixImages();
  }
})(); 