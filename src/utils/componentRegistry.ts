// Debug utility to track component instances and prevent cross-platform requests
let componentRegistry: Map<string, { platform: string; mountedAt: number }> = new Map();

export const registerComponent = (componentName: string, platform: string, componentId: string) => {
  const key = `${componentName}-${componentId}`;
  componentRegistry.set(key, { platform, mountedAt: Date.now() });
  
  console.log(`[ComponentRegistry] ✅ Registered ${componentName} for ${platform} (ID: ${componentId})`);
  console.log(`[ComponentRegistry] Active components:`, Array.from(componentRegistry.entries()).map(([k, v]) => `${k}: ${v.platform}`));
};

export const unregisterComponent = (componentName: string, componentId: string) => {
  const key = `${componentName}-${componentId}`;
  const component = componentRegistry.get(key);
  
  if (component) {
    componentRegistry.delete(key);
    console.log(`[ComponentRegistry] ❌ Unregistered ${componentName} (ID: ${componentId}) - was active for ${Date.now() - component.mountedAt}ms`);
  }
};

export const validateComponentRequest = (componentName: string, requestPlatform: string) => {
  const activeComponents = Array.from(componentRegistry.entries())
    .filter(([key]) => key.startsWith(componentName))
    .map(([key, value]) => ({ key, ...value }));
  
  if (activeComponents.length === 0) {
    console.warn(`[ComponentRegistry] 🤔 No active ${componentName} components found for request to ${requestPlatform}`);
    return true; // Allow if no components registered
  }
  
  const expectedPlatforms = [...new Set(activeComponents.map(c => c.platform))];
  
  if (expectedPlatforms.length > 1) {
    console.error(`[ComponentRegistry] 🚨 MULTIPLE PLATFORMS DETECTED for ${componentName}:`, expectedPlatforms);
    console.error(`[ComponentRegistry] Active components:`, activeComponents);
  }
  
  if (!expectedPlatforms.includes(requestPlatform)) {
    console.error(`[ComponentRegistry] ❌ INVALID REQUEST: ${componentName} active for [${expectedPlatforms.join(', ')}] but request is for ${requestPlatform}`);
    return false;
  }
  
  return true;
};

export const getComponentStats = () => {
  const stats = new Map<string, { platforms: string[], count: number }>();
  
  for (const [key, value] of componentRegistry.entries()) {
    const componentName = key.split('-')[0];
    const existing = stats.get(componentName) || { platforms: [], count: 0 };
    
    if (!existing.platforms.includes(value.platform)) {
      existing.platforms.push(value.platform);
    }
    existing.count++;
    
    stats.set(componentName, existing);
  }
  
  return stats;
};
