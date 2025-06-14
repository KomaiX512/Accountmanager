import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  auth, 
  onAuthStateChanged, 
  signInWithGoogle, 
  logoutUser,
  signInWithEmailPassword,
  registerWithEmailPassword,
  resetPassword
} from '../firebase/config';
import { clearInstagramConnection, disconnectInstagramAccount } from '../utils/instagramSessionManager';
import EmailVerificationService from '../services/EmailVerificationService';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendVerificationEmail: (email: string, userId: string) => Promise<{ success: boolean; message: string; demoMode?: boolean; verificationCode?: string }>;
  verifyEmailCode: (email: string, code: string, userId: string) => Promise<void>;
  resendVerificationCode: (email: string, userId: string) => Promise<{ success: boolean; message: string; demoMode?: boolean; verificationCode?: string }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  const signIn = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailPassword(email, password);
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with email/password');
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await registerWithEmailPassword(email, password, displayName);
    } catch (error: any) {
      setError(error.message || 'Failed to sign up with email/password');
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
    } catch (error: any) {
      setError(error.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationEmail = async (email: string, userId: string): Promise<{ success: boolean; message: string; demoMode?: boolean; verificationCode?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const result = await EmailVerificationService.sendVerificationEmail(email, userId);
      return result;
    } catch (error: any) {
      setError(error.message || 'Failed to send verification email');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailCode = async (email: string, code: string, userId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await EmailVerificationService.verifyEmailCode(email, code, userId);
    } catch (error: any) {
      setError(error.message || 'Failed to verify email code');
    } finally {
      setLoading(false);
    }
  };

  const resendVerificationCode = async (email: string, userId: string): Promise<{ success: boolean; message: string; demoMode?: boolean; verificationCode?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const result = await EmailVerificationService.resendVerificationCode(email, userId);
      return result;
    } catch (error: any) {
      setError(error.message || 'Failed to resend verification code');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Clear Instagram session data before logging out
      if (currentUser?.uid) {
        console.log(`[${new Date().toISOString()}] Clearing Instagram connection data for user ${currentUser.uid} during logout`);
        
        try {
          // First try to disconnect from backend
          await disconnectInstagramAccount(currentUser.uid);
        } catch (disconnectError) {
          console.error(`[${new Date().toISOString()}] Error during Instagram disconnect:`, disconnectError);
          // Continue with logout even if Instagram disconnect fails
          
          // Still clear local storage
          clearInstagramConnection(currentUser.uid);
        }
      }
      
      // Proceed with Firebase logout
      await logoutUser();
    } catch (error: any) {
      setError(error.message || 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  const clearError = (): void => {
    setError(null);
  };

  const value = {
    currentUser,
    loading,
    error,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    sendVerificationEmail,
    verifyEmailCode,
    resendVerificationCode,
    signOut,
    clearError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext; 