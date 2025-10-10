/**
 * UNIVERSAL BYPASS CHECKER
 * 
 * Simple rule: If user clicked "Access Dashboard", BYPASS ALL CONDITIONS.
 * No processing check, no validation, no backend calls - just access dashboard.
 */

export const isBypassActive = (platform: string, userId: string): boolean => {
  try {
    const bypassKey = `${platform}_bypass_active_${userId}`;
    const bypassFlag = localStorage.getItem(bypassKey);
    return bypassFlag !== null;
  } catch {
    return false;
  }
};

export const shouldAllowDashboardAccess = (platform: string, userId: string): boolean => {
  // If bypass active, ALWAYS allow - no questions asked
  if (isBypassActive(platform, userId)) {
    return true;
  }
  
  // Otherwise, check if processing is complete (countdown key doesn't exist)
  try {
    const processingCountdown = localStorage.getItem(`${platform}_processing_countdown`);
    return processingCountdown === null;
  } catch {
    return true; // If error, allow access
  }
};

export const getBypassInfo = (platform: string, userId: string) => {
  try {
    const timerKey = `${platform}_bypass_timer_${userId}`;
    const timerData = localStorage.getItem(timerKey);
    if (timerData) {
      return JSON.parse(timerData);
    }
  } catch {}
  return null;
};
