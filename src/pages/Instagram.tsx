import React, { useState } from 'react';
import IG_EntryUsernames from '../components/instagram/IG_EntryUsernames';
import Dashboard from '../components/instagram/Dashboard';
import { AnimatePresence } from 'framer-motion';

const Instagram: React.FC = () => {
  const [showEntryForm, setShowEntryForm] = useState(true);
  const [submittedData, setSubmittedData] = useState<{
    accountHolder: string;
    competitors: string[];
  } | null>(null);

  const handleSubmitSuccess = (accountHolder: string, competitors: string[]) => {
    setSubmittedData({ accountHolder, competitors });
    setShowEntryForm(false);
  };

  return (
    <div className="instagram-page">
      <AnimatePresence mode="wait">
        {showEntryForm ? (
          <IG_EntryUsernames
            key="entry"
            onSubmitSuccess={handleSubmitSuccess}
          />
        ) : (
          <Dashboard
            key="dashboard"
            accountHolder={submittedData!.accountHolder}
            competitors={submittedData!.competitors}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Instagram;