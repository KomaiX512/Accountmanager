import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProcessingLoadingState from '../components/common/ProcessingLoadingState';
import { useProcessing } from '../context/ProcessingContext';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const { processingState, completeProcessing } = useProcessing();

  // If no processing is active, redirect to dashboard
  useEffect(() => {
    if (!processingState.isProcessing) {
      navigate('/dashboard', { replace: true });
    }
  }, [processingState.isProcessing, navigate]);

  const handleComplete = () => {
    completeProcessing();
    navigate('/dashboard', { replace: true });
  };

  // Don't render anything if no processing is active
  if (!processingState.isProcessing) {
    return null;
  }

  return (
    <ProcessingLoadingState onComplete={handleComplete} />
  );
};

export default Processing; 