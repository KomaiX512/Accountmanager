class EmailVerificationService {
  private static readonly API_BASE_URL = 'http://localhost:3002/api';

  /**
   * Send verification email to user
   */
  static async sendVerificationEmail(email: string, userId: string): Promise<{ success: boolean; message: string; demoMode?: boolean; verificationCode?: string }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/send-verification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send verification email');
      }

      return result;
    } catch (error: any) {
      console.error('[EmailVerificationService] Error sending verification email:', error);
      throw new Error(error.message || 'Failed to send verification email');
    }
  }

  /**
   * Verify email code
   */
  static async verifyEmailCode(email: string, code: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/verify-email-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code, userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to verify email code');
      }

      return result;
    } catch (error: any) {
      console.error('[EmailVerificationService] Error verifying email code:', error);
      throw new Error(error.message || 'Failed to verify email code');
    }
  }

  /**
   * Resend verification code
   */
  static async resendVerificationCode(email: string, userId: string): Promise<{ success: boolean; message: string; demoMode?: boolean; verificationCode?: string }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/resend-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to resend verification code');
      }

      return result;
    } catch (error: any) {
      console.error('[EmailVerificationService] Error resending verification code:', error);
      throw new Error(error.message || 'Failed to resend verification code');
    }
  }
}

export default EmailVerificationService; 