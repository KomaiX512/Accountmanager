import React, { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import './PostScheduler.css';
import { useInstagram } from '../../context/InstagramContext';
import { schedulePost } from '../../utils/scheduleHelpers';
import useFeatureTracking from '../../hooks/useFeatureTracking';

interface PostSchedulerProps {
  userId: string;
  onClose: () => void;
  platform?: 'instagram' | 'twitter' | 'facebook';
}

interface FormData {
  image: FileList;
  caption: string;
}

const PostScheduler: React.FC<PostSchedulerProps> = ({ userId, onClose, platform = 'instagram' }) => {
  const { trackRealPostCreation, canUseFeature } = useFeatureTracking();
  
  // Get userId from context if not provided as prop
  const { userId: contextUserId, isConnected } = useInstagram();
  const userIdFromContext = isConnected ? contextUserId : null;
  const userIdToUse = userId || userIdFromContext;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateImage = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const { width, height } = img;
        const aspectRatio = width / height;
        const validAspectRatio = aspectRatio >= 0.8 && aspectRatio <= 1.91;
        const validResolution = width >= 320 && width <= 1080;
        const validType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
        const validSize = file.size <= 8 * 1024 * 1024;
        resolve(validAspectRatio && validResolution && validType && validSize);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(false);
    });
  };

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (!userIdToUse) {
      setError('Instagram connection required. Please connect your Instagram account.');
      return;
    }
    
    // ✅ PRE-ACTION CHECK: Verify post limits before proceeding
    const postAccessCheck = canUseFeature('posts');
    if (!postAccessCheck.allowed) {
      setError(postAccessCheck.reason || 'Posts feature is not available');
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Submitting post for user ${userIdToUse}`);
    if (!scheduleDate) {
      setError('Please select a schedule date and time.');
      return;
    }

    const file = data.image[0];
    if (!file) {
      setError('Please upload an image.');
      return;
    }

    // Enhanced validation with WebP support (auto-conversion)
    const isValidImage = await validateImage(file);
    if (!isValidImage) {
      setError('Invalid image. Must be JPEG/PNG/WebP, 320-1080px width, aspect ratio 0.8-1.91, max 8MB.');
      return;
    }

    setIsSubmitting(true);
    try {
      // ✅ REAL USAGE TRACKING: Check limits BEFORE scheduling post
      const trackingSuccess = await trackRealPostCreation(platform, {
        scheduled: true,
        immediate: false,
        type: 'single_platform_scheduled'
      });
      
      if (!trackingSuccess) {
        console.warn(`[PostScheduler] 🚫 Post scheduling blocked for ${platform} - limit reached`);
        setError('Post limit reached - upgrade to continue');
        setIsSubmitting(false);
        return;
      }
      
      // Use smart reusable schedule helper with enhanced error handling
      const result = await schedulePost({
        platform,
        userId: userIdToUse,
        imageBlob: file,
        caption: data.caption,
        scheduleTime: scheduleDate,
        postKey: undefined
      });
      
      if (result.success) {
        console.log(`[${new Date().toISOString()}] Post scheduled successfully for user ${userIdToUse} on ${platform}`);
        console.log(`[PostScheduler] ✅ Usage tracked: ${platform} post scheduled`);
        setError(null);
        onClose();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Post scheduling failed:`, err);
      setError('Failed to schedule post due to unexpected error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="post-scheduler-modal">
      <div className="post-scheduler-content">
        <h2 className="post-scheduler-title">
          {`Schedule ${(platform || 'Instagram').charAt(0).toUpperCase() + (platform || 'Instagram').slice(1)} Post`}
        </h2>
        {!userIdToUse ? (
          <div className="instagram-not-connected">
            <p>Connect your Instagram account to schedule posts.</p>
            <button
              type="button"
              onClick={onClose}
              className="insta-btn disconnect"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-group">
              <label className="form-label">Image (JPEG/PNG/WebP, 1080x1080 recommended)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                {...register('image', { required: 'Image is required' })}
                className="form-input"
              />
              {errors.image && <p className="form-error">{errors.image.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Caption (max 2200 chars, 30 hashtags)</label>
              <textarea
                {...register('caption', {
                  maxLength: { value: 2200, message: 'Caption exceeds 2200 characters' },
                  validate: (value) => {
                    const hashtags = (value.match(/#[^\s#]+/g) || []).length;
                    return hashtags <= 30 || 'Maximum 30 hashtags allowed';
                  },
                })}
                className="form-input"
                rows={4}
                placeholder="Enter caption with hashtags..."
              />
              {errors.caption && <p className="form-error">{errors.caption.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Schedule Date & Time</label>
              <DatePicker
                selected={scheduleDate}
                onChange={(date: Date | null) => setScheduleDate(date)}
                showTimeSelect
                dateFormat="Pp"
                minDate={new Date()}
                maxDate={new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)}
                className="form-input"
                placeholderText="Select date and time"
                required
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="form-actions">
              <button
                type="button"
                onClick={onClose}
                className="insta-btn disconnect"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`insta-btn connect ${isSubmitting ? 'disabled' : ''}`}
              >
                {isSubmitting ? 'Scheduling...' : 'Schedule Post'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PostScheduler;