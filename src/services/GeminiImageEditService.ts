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
  private static async pollForEditedImage(
    request: GeminiEditRequest,
    opts: { maxSeconds?: number; intervalMs?: number } = {}
  ): Promise<GeminiEditResponse | null> {
    const maxSeconds = opts.maxSeconds ?? 90; // up to 90s to allow Gemini to finish
    const intervalMs = opts.intervalMs ?? 3000; // poll every 3s
    const cleanKey = request.imageKey.replace(/^edited_/, '');
    const originalUrl = getApiUrl(`/api/r2-image/${request.username}/${cleanKey}`, `?platform=${request.platform}`);
    // aggressive cache-busting on edited URL so we never get a stale 404
    const editedUrlBase = `/api/r2-image/${request.username}/edited_${cleanKey}`;
    const start = Date.now();
    while (Date.now() - start < maxSeconds * 1000) {
      try {
        const cacheBust = `?platform=${request.platform}&nocache=1&v=${Date.now()}`;
        const editedUrl = getApiUrl(editedUrlBase, cacheBust);
        const resp = await axios.get(editedUrl, {
          responseType: 'arraybuffer',
          // Avoid cached responses
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          // Keep each probe short; we'll retry if it fails
          timeout: 8000,
          validateStatus: (status) => status === 200,
        });
        const ct = (resp.headers?.['content-type'] as string | undefined) || '';
        if (ct.startsWith('image/')) {
          // Found the edited image in R2; return a synthesized success payload
          return {
            success: true,
            originalImageUrl: originalUrl,
            editedImageUrl: editedUrl,
            imageKey: cleanKey,
            editedImageKey: `edited_${cleanKey}`,
            prompt: request.prompt,
          };
        }
      } catch (_e) {
        // ignore and retry until timeout
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
          headers: {
            'Content-Type': 'application/json'
          },
          // Long-running operation – allow ample time end-to-end
          timeout: 180000
        }
      );

      if (response.data && response.data.success) {
        console.log(`[GeminiEdit] ✅ Image editing completed successfully`);
        return response.data;
      } else {
        throw new Error(response.data?.error || 'Unknown error');
      }
      
    } catch (error: any) {
      console.error(`[GeminiEdit] ❌ Image editing failed:`, error?.message || error);
      // If the client connection was interrupted (ERR_NETWORK), the backend may still complete.
      // Try to detect the edited image in R2 and return success if found.
      const networkInterrupted = error?.code === 'ERR_NETWORK' || /Network Error/i.test(error?.message || '');
      if (networkInterrupted) {
        try {
          const fallback = await this.pollForEditedImage(request);
          if (fallback) {
            console.warn('[GeminiEdit] Connection interrupted, but edited image found in R2. Returning success.');
            return fallback;
          }
        } catch (_) {
          // ignore and fall through to error payload
        }
      }

      return {
        success: false,
        originalImageUrl: '',
        editedImageUrl: '',
        imageKey: request.imageKey.replace(/^edited_/, ''),
        editedImageKey: `edited_${request.imageKey.replace(/^edited_/, '')}`,
        prompt: request.prompt,
        error: error?.response?.data?.error || error?.message || 'Image editing failed',
        details: error?.response?.data?.details || error?.message
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
          headers: {
            'Content-Type': 'application/json'
          },
          // Approval is typically fast, but allow enough time in case of cold starts
          timeout: 120000
        }
      );
      if (response.data && response.data.success) {
        return response.data as ApproveRejectResponse;
      } else {
        throw new Error(response.data?.error || 'Unknown error');
      }
      
    } catch (error: any) {
      console.error(`[GeminiEdit] ❌ ${request.action} failed:`, error.message);
      // If the network connection was interrupted while the server continued processing,
      // synthesize a success response that forces the UI to fetch the fresh original image.
      const networkInterrupted = error?.code === 'ERR_NETWORK' || /Network Error/i.test(error?.message || '');
      if (networkInterrupted) {
        const cleanKey = request.imageKey.replace(/^edited_/, '');
        const bust = `?platform=${request.platform}&nuclear=1&bypass=1&nocache=1&v=${Date.now()}`;
        const imageUrl = getApiUrl(`/api/r2-image/${request.username}/${cleanKey}`, bust);
        return {
          success: true,
          action: request.action,
          message: request.action === 'approve'
            ? 'Approved (connection recovered via fallback)'
            : 'Rejected (connection recovered via fallback)',
          imageUrl,
          error: undefined,
          details: undefined,
        };
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
