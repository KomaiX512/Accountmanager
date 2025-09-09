import React from 'react';
import LinkedInDashboard from '../components/linkedin/LinkedInDashboard';

const LinkedInDashboardPage: React.FC = () => {
  return (
    <LinkedInDashboard 
      accountHolder="testuser" 
      onOpenChat={() => console.log('Chat opened')}
    />
  );
};

export default LinkedInDashboardPage;
