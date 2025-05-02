import React, { useState, useEffect } from 'react';
import './InstagramConnect.css';

interface InstagramConnectProps {
  onConnected: (graphId: string, userId: string) => void;
}

const InstagramConnect: React.FC<InstagramConnectProps> = ({ onConnected }) => {
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Listen for OAuth redirect message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'INSTAGRAM_CONNECTED' && event.data.graphId && event.data.userId) {
        console.log(`[${new Date().toISOString()}] Received Instagram connection message:`, event.data);
        onConnected(event.data.graphId, event.data.userId);
        setIsConnecting(false);
      } else {
        console.error(`[${new Date().toISOString()}] Invalid Instagram connection message:`, event.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnected]);

  const connectToInstagram = () => {
    const appId = '576296982152813';
    const redirectUri = 'https://d1f9-121-52-146-243.ngrok-free.app/instagram/callback';
    const scope = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish';
    
    const authUrl = `https://api.instagram.com/oauth/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;

    setIsConnecting(true);
    
    // Open popup for Instagram OAuth
    const width = 600;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl,
      'instagram-auth',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  };

  return (
    <button 
      className="instagram-connect-btn" 
      onClick={connectToInstagram}
      disabled={isConnecting}
    >
      {isConnecting ? 'Connecting...' : 'Connect Instagram'}
    </button>
  );
};

export default InstagramConnect;