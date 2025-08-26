import React from 'react';
import { render, screen } from '@testing-library/react';
import PlatformUsageChart from './PlatformUsageChart';

// Simple mock for the hook
jest.mock('../../hooks/usePlatformUsageTracking', () => ({
  usePlatformUsageTracking: () => ({
    platformUsage: [],
    platformStatuses: {},
    isLoading: false,
    getAcquiredPlatforms: () => [],
    getTotalApiCalls: () => 0
  })
}));

describe('PlatformUsageChart - Simple Test', () => {
  it('should render without crashing', () => {
    render(<PlatformUsageChart />);
    expect(screen.getByText('Platform Usage Activity')).toBeInTheDocument();
  });

  it('should show empty state when no platforms are acquired', () => {
    render(<PlatformUsageChart />);
    expect(screen.getByText('No platforms acquired yet')).toBeInTheDocument();
  });
});
