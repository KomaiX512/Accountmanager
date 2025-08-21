/**
 * Comprehensive Unit Tests for Usage Tracking System
 * Tests all usage tracking features based on actual user actions
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import axios from 'axios';
import { useUsage, UsageProvider } from '../context/UsageContext';
import useDefensiveUsageTracking from '../hooks/useDefensiveUsageTracking';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock auth context
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'test-user-123' }
  })
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Test wrapper for UsageProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(UsageProvider, null, children);
};

describe('Usage Tracking System Tests', () => {
  // Mock IntersectionObserver
  beforeAll(() => {
    global.IntersectionObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  });

  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockClear();
    mockedAxios.post.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    (global.fetch as jest.Mock).mockClear();
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      username: 'testuser',
      platform: 'instagram'
    }));
    
    // Mock backend API responses
    mockedAxios.get.mockResolvedValue({
      data: {
        postsUsed: 5,
        discussionsUsed: 3,
        aiRepliesUsed: 2,
        campaignsUsed: 1,
        viewsUsed: 10,
        resetsUsed: 0
      }
    });
    
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        postsUsed: 6,
        discussionsUsed: 4,
        aiRepliesUsed: 3,
        campaignsUsed: 2,
        viewsUsed: 11,
        resetsUsed: 0
      }
    });
    
    // Mock fetch responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        postsUsed: 5,
        discussionsUsed: 3,
        aiRepliesUsed: 2,
        campaignsUsed: 1,
        viewsUsed: 10,
        resetsUsed: 0
      }),
      text: () => Promise.resolve(''),
      headers: new Map(),
      statusText: 'OK',
      redirected: false,
      type: 'basic',
      url: ''
    });
  });

  describe('1. Post Counting Tests', () => {
    test('should increment post count based on actual user actions', async () => {
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        // Wait for initial load
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.usage.posts).toBe(5);

      // Mock the increment response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 6,
          discussionsUsed: 3,
          aiRepliesUsed: 2,
          campaignsUsed: 1,
          viewsUsed: 10,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('posts', 'instagram', 1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'posts', count: 1 })
        })
      );
    });

    test('should increment usage correctly', async () => {
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        // Wait for initial load
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Mock the increment response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 6,
          discussionsUsed: 3,
          aiRepliesUsed: 2,
          campaignsUsed: 1,
          viewsUsed: 10,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('posts');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'posts', count: 1 })
        })
      );
    });
  });

  describe('2. Discussion Tracking Tests', () => {
    test('should track discussion usage correctly', async () => {
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.usage.discussions).toBe(3);

      // Mock the increment response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 5,
          discussionsUsed: 4,
          aiRepliesUsed: 2,
          campaignsUsed: 1,
          viewsUsed: 10,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('discussions', 'instagram', 1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'discussions', count: 1 })
        })
      );
    });

    test('should handle defensive discussion tracking', async () => {
      const { result } = renderHook(() => useDefensiveUsageTracking(), { wrapper: TestWrapper });
      
      // Mock successful tracking
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await act(async () => {
        await result.current.trackRealDiscussion('instagram', { type: 'chat' });
      });

      expect(result.current.isTrackingAvailable).toBe(true);
    });
  });

  describe('3. AI Reply Tracking Tests', () => {
    test('should track AI reply usage correctly', async () => {
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.usage.aiReplies).toBe(2);

      // Mock the increment response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 5,
          discussionsUsed: 3,
          aiRepliesUsed: 3,
          campaignsUsed: 1,
          viewsUsed: 10,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('aiReplies', 'instagram', 1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'aiReplies', count: 1 })
        })
      );
    });

    test('should handle defensive AI reply tracking', async () => {
      const { result } = renderHook(() => useDefensiveUsageTracking(), { wrapper: TestWrapper });
      
      // Mock successful tracking
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await act(async () => {
        await result.current.trackRealAIReply('instagram', { type: 'instant' });
      });

      await act(async () => {
        await result.current.trackRealAIReply('instagram', { type: 'auto' });
      });

      // Check that the increment API was called twice with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'aiReplies', count: 1 })
        })
      );
      
      // Note: We can't easily check for exactly 2 calls because there might be additional refresh calls
      // from useEffect hooks, but we can verify the increment calls were made correctly
    });
  });

  describe('4. Campaign/Goal Tracking Tests', () => {
    test('should track campaign usage correctly', async () => {
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.usage.campaigns).toBe(1);

      // Mock the increment response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 5,
          discussionsUsed: 3,
          aiRepliesUsed: 2,
          campaignsUsed: 2,
          viewsUsed: 10,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('campaigns', 'instagram', 1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'campaigns', count: 1 })
        })
      );
    });

    test('should handle defensive campaign tracking', async () => {
      const { result } = renderHook(() => useDefensiveUsageTracking(), { wrapper: TestWrapper });
      
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await act(async () => {
        await result.current.trackRealCampaign('instagram', { action: 'goal-submission' });
      });

      expect(result.current.isTrackingAvailable).toBe(true);
    });
  });

  describe('5. Cross-Device Synchronization Tests', () => {
    test('should load usage from backend (not localStorage)', async () => {
      renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should call backend API, not localStorage
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/instagram/testuser'
      );
      
      // Should not call localStorage.getItem for usage data
      expect(localStorageMock.getItem).not.toHaveBeenCalledWith(
        'usage_instagram_testuser'
      );
    });

    test('should handle backend errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Backend error'));
      
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should initialize with empty stats on backend error
      expect(result.current.usage).toEqual({
        posts: 0,
        discussions: 0,
        aiReplies: 0,
        campaigns: 0,
        views: 0,
        resets: 0
      });
    });

    test('should use platform/username schema for backend calls', async () => {
      // Override localStorage to return facebook as platform
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'accountHolder') {
          return JSON.stringify({
            username: 'testuser',
            platform: 'facebook'
          });
        }
        return null;
      });
      
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      // Reset the mock and set up specific response for this test
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 6,
          discussionsUsed: 3,
          aiRepliesUsed: 2,
          campaignsUsed: 1,
          viewsUsed: 10,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('posts', 'facebook', 1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/facebook/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'posts', count: 1 })
        })
      );
    });
  });

  describe('7. View Tracking Tests', () => {
    test('should track view usage correctly', async () => {
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      // Wait for initial load to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should have loaded 10 views from mocked backend response
      expect(result.current.usage.views).toBe(10);

      // Mock the increment response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          postsUsed: 5,
          discussionsUsed: 3,
          aiRepliesUsed: 2,
          campaignsUsed: 1,
          viewsUsed: 11,
          resetsUsed: 0
        }),
        text: () => Promise.resolve(''),
        headers: new Map(),
        statusText: 'OK',
        redirected: false,
        type: 'basic',
        url: ''
      });

      await act(async () => {
        await result.current.incrementUsage('views', 'instagram', 1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/instagram/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'views', count: 1 })
        })
      );
    });

    test('should handle defensive view tracking', async () => {
      const { result } = renderHook(() => useDefensiveUsageTracking(), { wrapper: TestWrapper });
      
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await act(async () => {
        await result.current.safeTrackFeature('views', 'module-view');
      });

      expect(result.current.isTrackingAvailable).toBe(true);
    });
  });

  describe('8. Backend Integration Tests', () => {
    test('should use correct API endpoints', async () => {
      // Override localStorage to return twitter as platform
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'accountHolder') {
          return JSON.stringify({
            username: 'testuser',
            platform: 'twitter'
          });
        }
        return null;
      });
      
      const { result } = renderHook(() => useUsage(), { wrapper: TestWrapper });
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      // Reset the mock and set up specific response for this test
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock)
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
          text: () => Promise.resolve(''),
          headers: new Map(),
          statusText: 'OK',
          redirected: false,
          type: 'basic',
          url: ''
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            posts: 6,
            discussions: 3,
            aiReplies: 2,
            campaigns: 1,
            views: 10,
            resets: 0
          }),
          text: () => Promise.resolve(''),
          headers: new Map(),
          statusText: 'OK',
          redirected: false,
          type: 'basic',
          url: ''
        }));

      await act(async () => {
        await result.current.incrementUsage('posts', 'twitter', 1);
      });
      
      // Should call the increment endpoint with correct path
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/increment/twitter/testuser',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature: 'posts', count: 1 })
        })
      );
      
      // Should also call the refresh endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/usage/twitter/testuser'
      );
    });

    test('should handle rate limiting gracefully', async () => {
      const { result } = renderHook(() => useDefensiveUsageTracking(), { wrapper: TestWrapper });
      
      // Reset the mock and set up specific error response for this test
      (global.fetch as jest.Mock).mockClear();
      // Mock the increment API call to reject with 429
      (global.fetch as jest.Mock)
        .mockImplementationOnce(() => Promise.reject({ 
          status: 429, 
          json: () => Promise.resolve({ error: 'Rate limited' })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            posts: 5,
            discussions: 3,
            aiReplies: 2,
            campaigns: 1,
            views: 10,
            resets: 0
          }),
          text: () => Promise.resolve(''),
          headers: new Map(),
          statusText: 'OK',
          redirected: false,
          type: 'basic',
          url: ''
        }));

      let errorThrown = false;
      try {
        await act(async () => {
          await result.current.safeIncrementUsage('posts', 1);
        });
      } catch (error) {
        errorThrown = true;
      }

      // Should not throw error on rate limiting when using defensive tracking
      expect(errorThrown).toBe(false);
      // The usage should remain unchanged since the increment failed
      // Note: We can't directly access the usage from the defensive hook, so we'll just verify no error was thrown
    });
  });
});
