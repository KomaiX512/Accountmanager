/**
 * Utility to set localStorage and trigger same-tab change detection
 */
export const setLocalStorageWithEvent = (key: string, value: string) => {
  localStorage.setItem(key, value);
  
  // Dispatch custom event for same-tab detection
  window.dispatchEvent(new Event('localStorageChanged'));
};

/**
 * Mark a platform as acquired and immediately notify the AcquiredPlatformsContext
 */
export const markPlatformAcquired = (platformId: string, userId: string) => {
  setLocalStorageWithEvent(`${platformId}_accessed_${userId}`, 'true');
  
  // Also update consolidated list
  const currentAcquired = JSON.parse(localStorage.getItem(`acquired_platforms_${userId}`) || '[]');
  if (!currentAcquired.includes(platformId)) {
    currentAcquired.push(platformId);
    setLocalStorageWithEvent(`acquired_platforms_${userId}`, JSON.stringify(currentAcquired));
  }
};
