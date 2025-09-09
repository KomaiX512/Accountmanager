export interface AIReply {
  reply: string;
  replyKey: string;
  reqKey: string;
  timestamp: number;
  generated_at: string;
  sendStatus?: 'sent' | 'sending' | 'error' | 'user-not-found' | 'network-error';
  sendError?: string;
}

export interface Notification {
  type: 'message' | 'comment' | 'reply' | 'comment_reply';
  instagram_user_id?: string;
  twitter_user_id?: string;
  facebook_page_id?: string;
  sender_id?: string;
  message_id?: string;
  text: string;
  post_id?: string;
  comment_id?: string;
  timestamp: number;
  received_at: string;
  username?: string;
  page_name?: string; // Facebook page name for enhanced display
  status: 'pending' | 'replied' | 'ignored' | 'sent' | 'ai_reply_ready';
  aiProcessing?: boolean;
  aiReply?: {
    reply: string;
    replyKey: string;
    reqKey: string;
    timestamp: number;
    generated_at: string;
    sendStatus?: string;
    sendError?: string;
  };
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
}

export interface ProfileInfo {
  fullName: string;
  followersCount: number;
  followsCount: number;
  profilePicUrlHD: string;
  biography?: string;
}

export interface LinkedAccount {
  url: string;
  username: string;
} 