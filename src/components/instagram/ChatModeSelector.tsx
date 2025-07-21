import React from 'react';
import { FaRegComments } from 'react-icons/fa';
import { MdPostAdd } from 'react-icons/md';
import './ChatModeSelector.css';

type ChatModeSelectorProps = {
  chatMode: 'discussion' | 'post';
  setChatMode: (mode: 'discussion' | 'post') => void;
}

const ChatModeSelector: React.FC<ChatModeSelectorProps> = ({ chatMode, setChatMode }) => {
  return (
    <div className="chat-mode-selector">
      <div className="chat-mode-selector-wrapper">
        <div 
          className={`chat-mode-option ${chatMode === 'discussion' ? 'active' : ''}`}
          onClick={() => setChatMode('discussion')}
        >
          <FaRegComments className="chat-mode-option-icon" />
          <span>Discussion Mode</span>
        </div>
        <div 
          className={`chat-mode-option ${chatMode === 'post' ? 'active' : ''}`}
          onClick={() => setChatMode('post')}
        >
          <MdPostAdd className="chat-mode-option-icon" />
          <span>Post Mode</span>
        </div>
      </div>
    </div>
  );
};

export default ChatModeSelector;
