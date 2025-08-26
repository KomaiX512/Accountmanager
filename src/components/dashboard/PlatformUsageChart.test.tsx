import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { UsageProvider } from '../../context/UsageContext';
import PlatformUsageChart from './PlatformUsageChart';

// Mock the platform usage tracking hook
jest.mock('../../hooks/usePlatformUsageTracking');

const mockUsePlatformUsageTracking = require('../../hooks/usePlatformUsageTracking').usePlatformUsageTracking;

// Mock fetch for platform status checks
global.fetch = jest.fn();

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <UsageProvider>
          {component}
        </UsageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('PlatformUsageChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('should show loading state initially', () => {
    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: [],
      platformStatuses: {},
      isLoading: true,
      getAcquiredPlatforms: jest.fn(),
      getTotalApiCalls: jest.fn()
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('Platform Usage Activity')).toBeInTheDocument();
    expect(screen.getByText('Loading platform usage...')).toBeInTheDocument();
  });

  it('should show empty state when no platforms are acquired', () => {
    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: [],
      platformStatuses: { instagram: false, twitter: false, facebook: false, linkedin: false },
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue([]),
      getTotalApiCalls: jest.fn()
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('No platforms acquired yet')).toBeInTheDocument();
    expect(screen.getByText('Acquire platforms to see your usage activity')).toBeInTheDocument();
  });

  it('should show guidance when platforms are acquired but no usage', () => {
    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: [],
      platformStatuses: { instagram: true, twitter: false, facebook: false, linkedin: false },
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue(['instagram']),
      getTotalApiCalls: jest.fn()
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('No usage activity yet')).toBeInTheDocument();
    expect(screen.getByText('Start using your acquired platforms to see activity data')).toBeInTheDocument();
  });

  it('should render chart with platform usage data', () => {
    const mockPlatformUsage = [
      {
        platform: 'instagram',
        displayName: 'Instagram',
        color: '#E4405F',
        icon: '/icons/instagram.svg',
        count: 25,
        percentage: 60,
        breakdown: {
          posts: 10,
          discussions: 8,
          aiReplies: 5,
          campaigns: 2
        },
        metadata: {
          lastActivity: new Date(),
          averageUsagePerDay: 1,
          growthRate: 5
        }
      },
      {
        platform: 'facebook',
        displayName: 'Facebook',
        color: '#1877F2',
        icon: '/icons/facebook.svg',
        count: 15,
        percentage: 40,
        breakdown: {
          posts: 6,
          discussions: 5,
          aiReplies: 3,
          campaigns: 1
        },
        metadata: {
          lastActivity: new Date(),
          averageUsagePerDay: 1,
          growthRate: 3
        }
      }
    ];

    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: mockPlatformUsage,
      platformStatuses: { instagram: true, twitter: false, facebook: true, linkedin: false },
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue(['instagram', 'facebook']),
      getTotalApiCalls: jest.fn().mockReturnValue(40)
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('Platform Usage Activity')).toBeInTheDocument();
    expect(screen.getByText('API calls distribution across acquired platforms')).toBeInTheDocument();
    
    // Check if platform names are displayed
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    
    // Check if usage counts are displayed
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    
    // Check if percentages are displayed
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    
    // Check legend
    expect(screen.getByText('Total API Calls:')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Active Platforms:')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should handle single platform usage correctly', () => {
    const mockPlatformUsage = [
      {
        platform: 'instagram',
        displayName: 'Instagram',
        color: '#E4405F',
        icon: '/icons/instagram.svg',
        count: 30,
        percentage: 100,
        breakdown: {
          posts: 15,
          discussions: 10,
          aiReplies: 3,
          campaigns: 2
        },
        metadata: {
          lastActivity: new Date(),
          averageUsagePerDay: 1,
          growthRate: 8
        }
      }
    ];

    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: mockPlatformUsage,
      platformStatuses: { instagram: true, twitter: false, facebook: false, linkedin: false },
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue(['instagram']),
      getTotalApiCalls: jest.fn().mockReturnValue(30)
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Active Platforms:')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should show chart subtitle', () => {
    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: [],
      platformStatuses: { instagram: true, twitter: false, facebook: false, linkedin: false },
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue(['instagram']),
      getTotalApiCalls: jest.fn()
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('API calls distribution across acquired platforms')).toBeInTheDocument();
  });

  it('should show legend note about usage distribution', () => {
    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: [],
      platformStatuses: { instagram: true, twitter: false, facebook: false, linkedin: false },
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue(['instagram']),
      getTotalApiCalls: jest.fn()
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('💡 Usage is distributed across acquired platforms based on feature activity')).toBeInTheDocument();
  });

  it('should handle platform status checking state', () => {
    mockUsePlatformUsageTracking.mockReturnValue({
      platformUsage: [],
      platformStatuses: {},
      isLoading: false,
      getAcquiredPlatforms: jest.fn().mockReturnValue([]),
      getTotalApiCalls: jest.fn()
    });

    renderWithProviders(<PlatformUsageChart />);
    
    expect(screen.getByText('Checking platform status...')).toBeInTheDocument();
  });
});
