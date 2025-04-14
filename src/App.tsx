import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import LeftBar from './components/common/LeftBar';
import TopBar from './components/common/TopBar';
import Instagram from './pages/Instagram';


const App: React.FC = () => {
  return (
    <div className="App">
      <TopBar />
      <div className="main-content">
        <LeftBar />
        <div className="content-area">
          <Routes>
            <Route path="/" element={<Instagram />} />
            <Route path="/instagram" element={<Instagram />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default App;