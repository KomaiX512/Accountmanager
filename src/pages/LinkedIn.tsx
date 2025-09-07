import React from 'react';
import LI_EntryUsernames from '../components/linkedin/LI_EntryUsernames';

const LinkedIn: React.FC = () => {
  return (
    <LI_EntryUsernames 
      onComplete={() => {
        console.log('LinkedIn entry completed');
      }}
    />
  );
};

export default LinkedIn;
