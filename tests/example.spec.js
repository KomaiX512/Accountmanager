import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Check if the page title is correct
  await expect(page).toHaveTitle(/Account Manager|Social Media/);
  
  // Take a screenshot for debugging
  await page.screenshot({ path: 'tests/screenshots/homepage.png' });
});

test('health check endpoint works', async ({ page }) => {
  // Test the health check endpoint
  const response = await page.request.get('/health');
  expect(response.status()).toBe(200);
  
  const data = await response.json();
  expect(data).toHaveProperty('status', 'ok');
});

test('API endpoints are accessible', async ({ page }) => {
  // Test that API endpoints are accessible
  const response = await page.request.get('/api/health');
  expect(response.status()).toBe(200);
});
