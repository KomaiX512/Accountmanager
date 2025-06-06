// R2 Image Fixer - Main Script
// This script is loaded by the server and handles fixing R2 image loading issues
(function() {
  console.log("R2 Image Fixer - Loaded");
  
  // Get the current server URL for proxying
  const currentHost = window.location.hostname;
  const proxyHost = currentHost === 'localhost' ? 'localhost:3002' : currentHost;
  const protocol = window.location.protocol || 'https:';
  
  // Define the problematic patterns
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
    // Handle the specific problematic URL pattern
    if (url.includes('narsissist') && url.includes('image_1749203937329.jpg')) {
      return `${protocol}//${proxyHost}/fix-image/narsissist/image_1749203937329.jpg?platform=instagram`;
    }
    
    // Try to extract username and filename for other URLs
    try {
      // Parse the URL
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Look for username in path
      let username = null;
      let filename = null;
      
      // Search for known usernames in path
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
        return `${protocol}//${proxyHost}/fix-image/${username}/${filename}?platform=instagram`;
      }
    } catch (error) {
      console.error('Error parsing URL:', error);
    }
    
    // Default fallback - generic placeholder with reference to original URL
    return `${protocol}//${proxyHost}/placeholder.jpg?src=${encodeURIComponent(url)}`;
  }
  
  // Function to fix all images on the page
  function fixAllImages() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      // Check if this is a problematic image
      if (isProblematicUrl(img.src)) {
        const originalSrc = img.src;
        const fixedSrc = fixImageUrl(originalSrc);
        console.log(`R2 Fixer: Replacing ${originalSrc} with ${fixedSrc}`);
        img.src = fixedSrc;
        
        // Also add an error handler for this specific image
        img.onerror = function(e) {
          console.log(`R2 Fixer: Fallback for ${fixedSrc} failed, using placeholder`);
          this.src = `${protocol}//${proxyHost}/placeholder.jpg?origin=${encodeURIComponent(fixedSrc)}`;
        };
      }
    });
  }
  
  // Fix images when they fail to load
  document.addEventListener('error', function(event) {
    if (event.target.tagName === 'IMG') {
      const img = event.target;
      const originalSrc = img.src;
      
      // Don't try to handle images that have already been fixed
      if (originalSrc.includes('/fix-image/') || originalSrc.includes('/placeholder.jpg')) {
        return;
      }
      
      console.log(`R2 Fixer: Image load error for ${originalSrc}`);
      
      // Only handle potentially problematic URLs
      if (isProblematicUrl(originalSrc)) {
        event.preventDefault();
        event.stopPropagation();
        
        const fixedSrc = fixImageUrl(originalSrc);
        console.log(`R2 Fixer: Replacing failed image with ${fixedSrc}`);
        img.src = fixedSrc;
      }
    }
  }, true);
  
  // Watch for dynamic content changes
  const observer = new MutationObserver(function(mutations) {
    let hasNewImages = false;
    
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'src' && 
            mutation.target.tagName === 'IMG' && 
            isProblematicUrl(mutation.target.src)) {
          hasNewImages = true;
        }
      } else if (mutation.addedNodes.length) {
        // Check if any added nodes are images or contain images
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) { // Element node
            if (node.tagName === 'IMG' && isProblematicUrl(node.src)) {
              hasNewImages = true;
            } else if (node.querySelectorAll) {
              const images = node.querySelectorAll('img');
              if (images.length > 0) {
                hasNewImages = true;
              }
            }
          }
        });
      }
    });
    
    // Only run the fix if new images were detected
    if (hasNewImages) {
      fixAllImages();
    }
  });
  
  // Start observing the document
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
  
  // Run the initial fix
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixAllImages);
  } else {
    fixAllImages();
  }
  
  // Expose the fix function globally so it can be called manually
  window.fixR2Images = fixAllImages;
  
  // Periodic check for any missed images (fallback)
  setInterval(fixAllImages, 5000);
  
})(); 