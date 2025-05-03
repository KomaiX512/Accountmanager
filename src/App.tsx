import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';
import Dashboard from './components/instagram/Dashboard';
import NonBrandingDashboard from './components/instagram/NonBrandingDashboard';

const App: React.FC = () => {
  const location = useLocation();
  const { accountHolder, competitors, userId } = location.state || { accountHolder: '', competitors: [], userId: undefined };

  return (
    <div className="App">
      <TopBar />
      <div className="main-content">
        <LeftBar accountHolder={accountHolder} userId={userId} />
        <div className="content-area">
          <Routes>
            <Route path="/" element={<Instagram />} />
            <Route path="/instagram" element={<Instagram />} />
            <Route
              path="/dashboard"
              element={<Dashboard accountHolder={accountHolder} competitors={competitors} />}
            />
            <Route
              path="/non-branding-dashboard"
              element={<NonBrandingDashboard accountHolder={accountHolder} />}
            />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default App;