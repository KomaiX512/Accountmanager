import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';
import Dashboard from './components/instagram/Dashboard';
import NonBrandingDashboard from './components/instagram/NonBrandingDashboard';
import Login from './components/auth/Login';
import PrivateRoute from './components/auth/PrivateRoute';
import { AuthProvider } from './context/AuthContext';

const App: React.FC = () => {
  const location = useLocation();
  const { accountHolder, competitors, userId } = location.state || { accountHolder: '', competitors: [], userId: undefined };
  const isLoginPage = location.pathname === '/login';

  return (
    <AuthProvider>
      <div className="App">
        <TopBar />
        <div className="main-content">
          {!isLoginPage && <LeftBar accountHolder={accountHolder} userId={userId} />}
          <div className={`content-area ${isLoginPage ? 'full-width' : ''}`}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Instagram />
                  </PrivateRoute>
                }
              />
              <Route
                path="/instagram"
                element={
                  <PrivateRoute>
                    <Instagram />
                  </PrivateRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <Dashboard accountHolder={accountHolder} competitors={competitors} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/non-branding-dashboard"
                element={
                  <PrivateRoute>
                    <NonBrandingDashboard accountHolder={accountHolder} />
                  </PrivateRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </AuthProvider>
  );
};

export default App;