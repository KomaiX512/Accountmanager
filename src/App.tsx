// src/App.tsx
import React, { useState } from 'react';
import './App.css';
import UsernameEntry from './components/IG_EntryUsernames';

const App: React.FC = () => {
  const [showUsernameEntry, setShowUsernameEntry] = useState(true);

  const handleSubmitSuccess = () => {
    setShowUsernameEntry(false);
    // Add your dashboard logic here
  };

  return (
    <div className="App">
      {showUsernameEntry ? (
        <UsernameEntry onSubmitSuccess={handleSubmitSuccess} />
      ) : (
        <div className="dashboard">
          {/* Your main dashboard content goes here */}
          <h1>Welcome to Dashboard</h1>
        </div>
      )}
    </div>
  );
};

export default App;