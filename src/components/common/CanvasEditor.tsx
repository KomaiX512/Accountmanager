import React, { useEffect, useRef, useState, useCallback } from 'react';
import './CanvasEditor.css';
import { motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import 'tui-image-editor/dist/tui-image-editor.css';
import axios from 'axios';

interface CanvasEditorProps {
  onClose: () => void;
  username: string;
  userId?: string;
  initialImageUrl?: string;
  postKey?: string;
  postCaption?: string;
}

const CanvasEditor: React.FC<CanvasEditorProps> = ({ 
  onClose, 
  username, 
  userId, 
  initialImageUrl, 
  postKey, 
  postCaption 
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const tuiInstanceRef = useRef<any>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(new Date(Date.now() + 60 * 1000)); // 1 min in future
  const [isScheduling, setIsScheduling] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const initialLoadAttemptedRef = useRef(false);

  // Color palette for quick selection
  const colorPalette = [
    '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', 
    '#ffff00', '#00ffff', '#ff00ff', '#ff6600', '#6600ff',
    '#00cc99', '#cc0066', '#ffcc00', '#9900cc', '#66ff33'
  ];

  // Debounce function to avoid rapid consecutive operations
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // Initialize the editor
  useEffect(() => {
    const loadEditor = async () => {
      try {
        // Dynamically import tui-image-editor to avoid SSR issues
        const ImageEditor = (await import('tui-image-editor')).default;
        
        if (editorRef.current && !tuiInstanceRef.current) {
          // Initialize the editor
          tuiInstanceRef.current = new ImageEditor(editorRef.current, {
            includeUI: {
              loadImage: {
                path: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                name: 'Blank'
              },
              theme: {
                'common.bi.image': '',
                'common.bisize.width': '0',
                'common.bisize.height': '0',
                'common.backgroundColor': '#151521',
                'common.border': '0px',
                'downloadButton.backgroundColor': '#007bff',
                'downloadButton.border': '1px solidrgb(63, 167, 149)',
                'downloadButton.color': '#fff',
                'menu.normalIcon.path': '',
                'menu.normalIcon.name': '',
                'menu.activeIcon.path': '',
                'menu.activeIcon.name': '',
                'menu.iconSize.width': '24px',
                'menu.iconSize.height': '24px',
                'submenu.backgroundColor': '#1e1e2d',
                'submenu.partition.color': '#3c3c57',
                'submenu.normalIcon.path': '',
                'submenu.normalIcon.name': '',
                'submenu.activeIcon.path': '',
                'submenu.activeIcon.name': '',
                'submenu.iconSize.width': '32px',
                'submenu.iconSize.height': '32px',
                'submenu.normalLabel.color': '#8a8aaa',
                'submenu.activeLabel.color': '#fff',
                'checkbox.border': '1px solid #ccc',
                'checkbox.backgroundColor': '#fff',
                // Enhanced color picker styling
                'colorpicker.button.border': '1px solid #ddd',
                'colorpicker.title.color': '#fff',
                'colorpicker.primary.color': '#00ffcc'
              } as any,
              menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
              initMenu: 'filter',
              menuBarPosition: 'bottom',
              uiSize: {
                width: '100%',
                height: '100%'
              },
            },
            cssMaxWidth: 700,
            cssMaxHeight: 500,
            selectionStyle: {
              cornerSize: 20,
              rotatingPointOffset: 70,
            },
            usageStatistics: false
          });
          
          // Add custom fonts if needed
          tuiInstanceRef.current.registerIcons({
            'custom-icon': {
              'preset-1': 'path/to/icon.svg',
            }
          });

          // Register editor ready state
          setIsEditorReady(true);
          
          // Add event listeners to stabilize editor
          if (tuiInstanceRef.current._eventHandler) {
            tuiInstanceRef.current._eventHandler.on('loadImage', () => {
              console.log('[Canvas] Image loaded event triggered');
              setImageLoaded(true);
              setIsProcessing(false);
            });

            tuiInstanceRef.current._eventHandler.on('applyFilter', () => {
              console.log('[Canvas] Filter applied successfully');
              setIsProcessing(false);
            });
          }

          // Load initial image if provided (will be handled in separate useEffect)
        }
      } catch (error) {
        console.error('Failed to load TUI Image Editor:', error);
        setNotification('Failed to load image editor. Please try again.');
        setTimeout(() => setNotification(null), 3000);
      }
    };

    loadEditor();

    return () => {
      if (tuiInstanceRef.current) {
        tuiInstanceRef.current.destroy();
        tuiInstanceRef.current = null;
      }
    };
  }, []);

  // Handle loading the initial image separately
  useEffect(() => {
    const loadInitialImage = async () => {
      if (initialImageUrl && isEditorReady && !initialLoadAttemptedRef.current) {
        initialLoadAttemptedRef.current = true;
        console.log('[Canvas] Loading initial image...');
        await loadImageFromUrl(initialImageUrl);
      }
    };

    loadInitialImage();
  }, [initialImageUrl, isEditorReady]);

  // Handle enhancing color pickers
  useEffect(() => {
    if (isEditorReady) {
      // Enhance color pickers after editor is initialized and stable
      const enhanceColorPickers = debounce(() => {
        try {
          // Find all color pickers in the editor and enhance them
          const colorButtons = document.querySelectorAll('.tui-colorpicker-palette-button');
          if (colorButtons.length > 0) {
            console.log('[Canvas] Found color picker buttons:', colorButtons.length);
            
            // Create preset color elements and add them to each color picker
            colorButtons.forEach(button => {
              button.setAttribute('title', 'Click to select colors');

              // Find the parent color picker container
              const container = button.closest('.tui-colorpicker-container');
              if (container) {
                // Check if we've already added presets to avoid duplication
                if (container.querySelector('.tui-custom-preset-colors')) {
                  return;
                }
                
                // Create preset colors container
                const presetsContainer = document.createElement('div');
                presetsContainer.className = 'tui-custom-preset-colors';
                presetsContainer.style.display = 'flex';
                presetsContainer.style.flexWrap = 'wrap';
                presetsContainer.style.gap = '5px';
                presetsContainer.style.margin = '5px 0';
                presetsContainer.style.padding = '5px';
                presetsContainer.style.background = 'rgba(0,0,0,0.2)';
                presetsContainer.style.borderRadius = '4px';
                
                // Add preset color swatches
                colorPalette.forEach(color => {
                  const swatch = document.createElement('div');
                  swatch.style.width = '20px';
                  swatch.style.height = '20px';
                  swatch.style.backgroundColor = color;
                  swatch.style.cursor = 'pointer';
                  swatch.style.borderRadius = '3px';
                  swatch.style.border = '1px solid rgba(255,255,255,0.2)';
                  swatch.setAttribute('data-color', color);
                  swatch.title = color;
                  
                  // When clicked, set this color in the color picker
                  swatch.addEventListener('click', () => {
                    // Find the input element and set its value
                    const input = container.querySelector('.tui-colorpicker-palette-hex');
                    if (input) {
                      // @ts-ignore
                      input.value = color;
                      // Trigger change event
                      const event = new Event('change', { bubbles: true });
                      input.dispatchEvent(event);
                    }
                  });
                  
                  presetsContainer.appendChild(swatch);
                });
                
                // Insert preset colors before the palette
                const paletteElement = container.querySelector('.tui-colorpicker-palette');
                if (paletteElement) {
                  paletteElement.parentNode?.insertBefore(presetsContainer, paletteElement);
                }
              }
            });
          }
        } catch (err) {
          console.error('[Canvas] Error enhancing color pickers:', err);
        }
      }, 1000);

      enhanceColorPickers();
    }
  }, [isEditorReady, colorPalette]);

  const loadImageFromUrl = useCallback(async (url: string) => {
    if (!isEditorReady || !tuiInstanceRef.current || isProcessing) {
      console.log('[Canvas] Editor not ready or processing, deferring image load');
      return;
    }
    
    try {
      setIsProcessing(true);
      setImageLoaded(false);
      
      // If URL is relative or needs proxying, use proxy
      const proxyUrl = url.startsWith('http') 
        ? `http://localhost:3000/proxy-image?url=${encodeURIComponent(url)}`
        : url;
        
      console.log(`[Canvas] Loading image from URL: ${proxyUrl}`);
      
      // Try loading via blob to avoid CORS and state lock issues
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      
      // Wait for any ongoing operations to complete
      setTimeout(async () => {
        try {
          await tuiInstanceRef.current.loadImageFromURL(imageUrl, 'user-upload');
          console.log('[Canvas] Image loaded successfully via blob');
          setImageLoaded(true);
          
          // Clean up the object URL
          URL.revokeObjectURL(imageUrl);
        } catch (error) {
          console.error('[Canvas] Error loading image from blob:', error);
          setNotification('Failed to load image. Please try again.');
          setIsProcessing(false);
        }
      }, 100);
    } catch (err) {
      console.error('[Canvas] Error in loadImageFromUrl:', err);
      setNotification('Failed to load image. Please try uploading manually.');
      setIsProcessing(false);
    }
  }, [isEditorReady, isProcessing]);

  const handleSchedule = () => {
    setShowScheduler(true);
  };

  const handleScheduleConfirm = async () => {
    if (!scheduleDate || !userId) {
      setNotification('Missing date or user ID');
      return;
    }
    
    setIsScheduling(true);
    
    try {
      // Get the canvas image as a data URL
      const imageDataUrl = tuiInstanceRef.current.toDataURL();
      const imageBlob = await fetch(imageDataUrl).then(r => r.blob());
      
      // Convert to form data for the backend API
      const formData = new FormData();
      const filename = postKey ? `post_${postKey}.jpg` : `canvas_${Date.now()}.jpg`;
      formData.append('image', imageBlob, filename);
      formData.append('caption', postCaption || '');
      formData.append('scheduleDate', scheduleDate.toISOString());
      
      // Send the scheduled post to the backend
      const resp = await fetch(`http://localhost:3000/schedule-post/${userId}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Unknown server error');
      }
      
      setNotification('Your post is now scheduled!');
      
      // Close the scheduler after 2 seconds
      setTimeout(() => {
        setShowScheduler(false);
        // Close the editor after another second
        setTimeout(onClose, 1000);
      }, 2000);
    } catch (error) {
      console.error('Error scheduling post:', error);
      setNotification(`Failed to schedule post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isEditorReady || isProcessing) return;

    setIsProcessing(true);
    setImageLoaded(false);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      if (tuiInstanceRef.current) {
        // Use setTimeout to avoid state lock issues
        setTimeout(async () => {
          try {
            await tuiInstanceRef.current.loadImageFromURL(imageUrl, 'user-upload');
            console.log('[Canvas] Image loaded successfully from file upload');
            setImageLoaded(true);
            setIsProcessing(false);
          } catch (err) {
            console.error('[Canvas] Error loading image from file upload:', err);
            setNotification('Failed to load image. Please try again.');
            setIsProcessing(false);
          }
        }, 100);
      }
    };
    
    reader.onerror = () => {
      console.error('[Canvas] Error reading file');
      setNotification('Failed to read image file. Please try again with a different image.');
      setIsProcessing(false);
    };
    
    reader.readAsDataURL(file);
  };

  return (
    <motion.div
      className="canvas-editor-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="canvas-editor-container"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        <div className="canvas-editor-header">
          <h2>Image Editor</h2>
          <div className="canvas-upload-container">
            <label htmlFor="image-upload" className={`upload-button ${isProcessing ? 'disabled' : ''}`}>
              Upload Image
            </label>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden-input"
              disabled={isProcessing || !isEditorReady}
            />
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="tui-image-editor-container" ref={editorRef}>
          {isProcessing && (
            <div className="editor-loading-overlay">
              <div className="editor-loading-spinner">Loading...</div>
            </div>
          )}
        </div>
        
        <div className="canvas-editor-footer">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          <button 
            className="schedule-button" 
            onClick={handleSchedule}
            disabled={!imageLoaded || isProcessing}
          >
            Schedule
          </button>
        </div>
        
        {showScheduler && (
          <div className="scheduler-overlay">
            <div className="scheduler-container">
              <h3>Schedule Your Post</h3>
              <p>Select date and time to publish your post:</p>
              
              <DatePicker 
                selected={scheduleDate}
                onChange={(date) => setScheduleDate(date)}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                timeCaption="Time"
                dateFormat="MMMM d, yyyy h:mm aa"
                minDate={new Date()}
                className="date-picker"
              />
              
              <div className="scheduler-actions">
                <button 
                  className="cancel-button" 
                  onClick={() => setShowScheduler(false)}
                  disabled={isScheduling}
                >
                  Cancel
                </button>
                <button 
                  className="confirm-button" 
                  onClick={handleScheduleConfirm}
                  disabled={isScheduling}
                >
                  {isScheduling ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {notification && (
          <div className="notification-popup">
            {notification}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default CanvasEditor; 