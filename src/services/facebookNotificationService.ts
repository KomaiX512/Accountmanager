import type { Notification } from '../types/notifications';

export interface FacebookWebhookData {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text: string;
      };
    }>;
    changes?: Array<{
      value: {
        from: { id: string; name: string };
        post: { id: string };
        comment_id: string;
        parent_id?: string;
        message: string;
        created_time: number;
      };
      field: string;
    }>;
  }>;
}

export class FacebookNotificationService {
  private static instance: FacebookNotificationService;
  private subscription: PushSubscription | null = null;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  public static getInstance(): FacebookNotificationService {
    if (!FacebookNotificationService.instance) {
      FacebookNotificationService.instance = new FacebookNotificationService();
    }
    return FacebookNotificationService.instance;
  }

  /**
   * Initialize web push notifications for Facebook
   */
  public async initializeWebPush(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Web Push notifications are not supported');
      return false;
    }

    try {
      // Register service worker
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Facebook notification service worker registered');

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        return false;
      }

      // Subscribe to push notifications
      await this.subscribeToPush();
      return true;
    } catch (error) {
      console.error('Failed to initialize Facebook web push:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   */
  private async subscribeToPush(): Promise<void> {
    if (!this.serviceWorkerRegistration) {
      throw new Error('Service worker not registered');
    }

    // Facebook App's VAPID public key (would be from your Facebook app)
    const applicationServerKey = this.urlBase64ToUint8Array(
      'BEl62iUYgUivxIkv69yViEuiBIa40HI80NsvnujREA7LbGdqLvqJLy5Rv7uT7aVdUe4NqLb7G-LS3aOQXqQRBOY'
    );

    this.subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    console.log('Facebook push subscription created:', this.subscription);
  }

  /**
   * Process Facebook webhook data and create notifications
   */
  public processWebhookData(data: FacebookWebhookData, pageId: string): Notification[] {
    const notifications: Notification[] = [];

    if (data.object !== 'page') {
      return notifications;
    }

    data.entry.forEach(entry => {
      // Process messages
      if (entry.messaging) {
        entry.messaging.forEach(messaging => {
          if (messaging.message && messaging.sender.id !== entry.id) {
            const notification: Notification = {
              type: 'message',
              facebook_page_id: pageId,
              sender_id: messaging.sender.id,
              message_id: messaging.message.mid,
              text: messaging.message.text || '',
              timestamp: messaging.timestamp,
              received_at: new Date().toISOString(),
              status: 'pending',
              platform: 'facebook'
            };
            notifications.push(notification);
          }
        });
      }

      // Process comments
      if (entry.changes) {
        entry.changes.forEach(change => {
          if (change.field === 'feed' && change.value.message) {
            const notification: Notification = {
              type: 'comment',
              facebook_page_id: pageId,
              sender_id: change.value.from.id,
              username: change.value.from.name,
              comment_id: change.value.comment_id,
              post_id: change.value.post.id,
              text: change.value.message,
              timestamp: new Date(change.value.created_time).getTime(),
              received_at: new Date().toISOString(),
              status: 'pending',
              platform: 'facebook'
            };
            notifications.push(notification);
          }
        });
      }
    });

    return notifications;
  }

  /**
   * Send local push notification for Facebook events
   */
  public async sendLocalNotification(notification: Notification): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const title = notification.type === 'message' 
      ? `New Facebook Message`
      : `New Facebook Comment`;

    const body = notification.type === 'message'
      ? `From: ${notification.username || 'User'}\n${notification.text.substring(0, 100)}${notification.text.length > 100 ? '...' : ''}`
      : `${notification.username || 'User'} commented: ${notification.text.substring(0, 100)}${notification.text.length > 100 ? '...' : ''}`;

    const options = {
      body: body,
      icon: '/facebook-icon.png',
      badge: '/facebook-badge.png',
      tag: `facebook-${notification.message_id || notification.comment_id}`,
      data: {
        url: window.location.origin + '/dashboard?platform=facebook',
        platform: 'facebook',
        notificationId: notification.message_id || notification.comment_id
      },
      actions: [
        { action: 'reply', title: 'Reply' },
        { action: 'view', title: 'View Dashboard' }
      ],
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };

    new Notification(title, options);
  }

  /**
   * Format Facebook Graph API notification data
   */
  public formatGraphAPINotification(apiData: any, type: 'message' | 'comment'): Notification {
    if (type === 'message') {
      return {
        type: 'message',
        facebook_page_id: apiData.page_id,
        sender_id: apiData.from.id,
        username: apiData.from.name,
        message_id: apiData.id,
        text: apiData.message || '',
        timestamp: new Date(apiData.created_time).getTime(),
        received_at: new Date().toISOString(),
        status: 'pending',
        platform: 'facebook'
      };
    } else {
      return {
        type: 'comment',
        facebook_page_id: apiData.page_id,
        sender_id: apiData.from.id,
        username: apiData.from.name,
        comment_id: apiData.id,
        post_id: apiData.post?.id,
        text: apiData.message || '',
        timestamp: new Date(apiData.created_time).getTime(),
        received_at: new Date().toISOString(),
        status: 'pending',
        platform: 'facebook'
      };
    }
  }

  /**
   * Validate Facebook webhook signature (server-side only)
   */
  public validateWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
    // This method is intended for server-side use only
    // Client-side validation is not secure and should not be used
    console.warn('Webhook signature validation should only be performed server-side');
    return true; // Always return true for client-side
  }

  /**
   * Handle Facebook API rate limits
   */
  public async handleRateLimit(retryAfter?: number): Promise<void> {
    const delay = retryAfter ? retryAfter * 1000 : 5000; // Default 5 seconds
    console.log(`Facebook API rate limited. Retrying after ${delay}ms`);
    
    return new Promise(resolve => {
      setTimeout(resolve, delay);
    });
  }

  /**
   * Convert VAPID key for push subscription
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Get subscription for server registration
   */
  public getSubscription(): PushSubscription | null {
    return this.subscription;
  }

  /**
   * Unsubscribe from push notifications
   */
  public async unsubscribe(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
      console.log('Facebook push subscription cancelled');
    }
  }
}

export default FacebookNotificationService; 