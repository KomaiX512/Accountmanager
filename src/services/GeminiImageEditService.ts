import axios from 'axios';
import { getApiUrl } from '../config/api';

export interface GeminiEditRequest {
  imageKey: string;
  username: string;
  platform: string;
  prompt: string;
}

export interface GeminiEditResponse {
  success: boolean;
  originalImageUrl: string;
  editedImageUrl: string;
  imageKey: string;
  editedImageKey: string;
  prompt: string;
  error?: string;
  details?: string;
}

export interface ApproveRejectRequest {
  imageKey: string;
  username: string;
  platform: string;
  action: 'approve' | 'reject';
}

export interface ApproveRejectResponse {
  success: boolean;
  action: string;
  message: string;
  imageUrl: string;
  error?: string;
  details?: string;
}

/**
 * Gemini Image Editing Service
 * Handles AI-powered image editing using Google Gemini API
 */
class GeminiImageEditService {
  /**
   * Poll for the edited image to appear in R2 in case the HTTP request was cut off
   * (e.g., proxy timeout) but the backend continued and saved the image.
   */
  private static async waitForEditedImage(
    username: string,
    platform: string,
    cleanImageKey: string,
    timeoutMs: number = 60000,
    intervalMs: number = 2000
  ): Promise<string | null> {
    const editedKey = `edited_${cleanImageKey}`;
    // Use exists-only probe with nuclear no-cache to avoid any proxy/HEAD quirks
    const editedUrlPath = `/api/r2-image/${username}/${editedKey}?platform=${platform}&exists=1&nuclear=1&t=${Date.now()}`;
    const editedUrl = getApiUrl(editedUrlPath);
    const end = Date.now() + timeoutMs;

    while (Date.now() < end) {
      try {
        // Use GET with exists=1 to avoid proxies mishandling HEAD
        const res = await fetch(editedUrl, {
          method: 'GET',
          cache: 'no-cache',
        });
        if (res.ok) return editedUrl;
      } catch (_) {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }
  
  /**
   * Edit an image using Gemini AI
   */
  static async editImage(request: GeminiEditRequest): Promise<GeminiEditResponse> {
    try {
      console.log(`[GeminiEdit] 🚀 Starting image edit for ${request.platform}/${request.username}/${request.imageKey}`);
      console.log(`[GeminiEdit] 📝 Prompt: "${request.prompt}"`);
      
      const response = await axios.post(
        getApiUrl('/api/gemini-image-edit'),
        request,
        {
          timeout: 180000, // 180 second timeout for AI operations (matches Vite proxy)
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success) {
        console.log(`[GeminiEdit] ✅ Image editing completed successfully`);
        return response.data;
      } else {
        throw new Error(response.data?.error || 'Unknown error');
      }
      
    } catch (error: any) {
      console.error(`[GeminiEdit] ❌ Image editing failed:`, error.message);

      // Fallback: if the network request failed locally (proxy/socket), poll R2 for the edited image
      const isNetworkish = (error?.message || '').toLowerCase().includes('network') || error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK';
      try {
        const cleanKey = request.imageKey.replace(/^edited_/, '');
        if (isNetworkish) {
          console.warn('[GeminiEdit] 🌐 Network error detected. Backend may still be processing...');
          console.warn('[GeminiEdit] 🔄 Polling R2 for edited image (60s timeout)...');
          const editedUrl = await GeminiImageEditService.waitForEditedImage(
            request.username,
            request.platform,
            cleanKey,
            60000,
            2000
          );
          if (editedUrl) {
            // Build display URLs without exists=1 probe parameter, with cache-busting
            const originalUrl = getApiUrl(`/api/r2-image/${request.username}/${cleanKey}?platform=${request.platform}&t=${Date.now()}`);
            const displayEditedUrl = getApiUrl(`/api/r2-image/${request.username}/edited_${cleanKey}?platform=${request.platform}&t=${Date.now()}`);
            console.log('[GeminiEdit] ✅ Fallback succeeded: Backend completed processing, edited image found in R2');
            return {
              success: true,
              originalImageUrl: originalUrl,
              editedImageUrl: displayEditedUrl,
              imageKey: cleanKey,
              editedImageKey: `edited_${cleanKey}`,
              prompt: request.prompt,
            };
          } else {
            console.error('[GeminiEdit] ❌ Fallback failed: Edited image not found after 60s polling');
          }
        }
      } catch (fallbackErr: any) {
        console.warn('[GeminiEdit] Fallback polling failed:', fallbackErr?.message || fallbackErr);
      }

      return {
        success: false,
        originalImageUrl: '',
        editedImageUrl: '',
        imageKey: request.imageKey.replace(/^edited_/, ''),
        editedImageKey: `edited_${request.imageKey.replace(/^edited_/, '')}`,
        prompt: request.prompt,
        error: error.response?.data?.error || error.message || 'Image editing failed',
        details: error.response?.data?.details || error.message
      };
    }
  }

  /**
   * Approve or reject an edited image
   * - approve: Replaces original with edited version and deletes edited temp file
   * - reject: Deletes edited temp file and keeps original
   */
  static async approveOrReject(request: ApproveRejectRequest): Promise<ApproveRejectResponse> {
    try {
      
      const response = await axios.post(
        getApiUrl('/api/ai-image-approve'),
        request,
        {
          timeout: 120000, // 120s for R2 copy+delete
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      if (response.data && response.data.success) {
        return response.data as ApproveRejectResponse;
      } else {
        throw new Error(response.data?.error || 'Unknown error');
      }
      
    } catch (error: any) {
      console.error(`[GeminiEdit] ❌ ${request.action} failed:`, error.message);

      // Fallback: if network error during approve, poll for resulting state
      const isNetworkish = (error?.message || '').toLowerCase().includes('network') || error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK';
      const cleanKey = request.imageKey.replace(/^edited_/, '');
      if (request.action === 'approve' && isNetworkish) {
        console.warn('[GeminiEdit] 🌐 Network error during approve. Polling R2 for approval state...');
        const originalUrl = getApiUrl(`/api/r2-image/${request.username}/${cleanKey}?platform=${request.platform}&t=${Date.now()}`);
        // Exists-only probes with strong no-cache to avoid fallback pixels and stale caches
        const probeOriginalUrl = getApiUrl(`/api/r2-image/${request.username}/${cleanKey}?platform=${request.platform}&exists=1&nuclear=1&t=${Date.now()}`);
        const probeEditedUrl = getApiUrl(`/api/r2-image/${request.username}/edited_${cleanKey}?platform=${request.platform}&exists=1&nuclear=1&t=${Date.now()}`);

        const end = Date.now() + 45000; // 45s verification window
        while (Date.now() < end) {
          try {
            // Check edited URL first - if 404, assume approval deleted edited image
            const editedProbe = await fetch(probeEditedUrl, { method: 'GET', cache: 'no-cache' });
            const originalProbe = await fetch(probeOriginalUrl, { method: 'GET', cache: 'no-cache' });

            if (!editedProbe.ok && originalProbe.ok) {
              console.log('[GeminiEdit] ✅ Fallback approve succeeded: edited image gone, original present');
              return {
                success: true,
                action: 'approved',
                message: 'Approved (fallback verification).',
                imageUrl: originalUrl,
              };
            }
          } catch (_) {
            // ignore and retry
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      return {
        success: false,
        action: request.action,
        message: error.response?.data?.error || error.message || `${request.action} failed`,
        imageUrl: '',
        error: error.response?.data?.error || error.message,
        details: error.response?.data?.details || error.message
      };
    }
  }
  /**
   * Get predefined editing prompts for quick access
   */
  static getPredefinedPrompts(): string[] {
    return [
      "Change the background to a vibrant sunset",
      "Make the outfit more elegant and professional",
      "Add modern typography with bold text overlay",
      "Change to a minimalist white background",
      "Transform into a vintage aesthetic with warm tones"
    ];
  }
}

export default GeminiImageEditService;
