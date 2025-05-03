import React, { useEffect, useRef, useState } from 'react';
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
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#ffffff');

  // Color palette for quick selection
  const colorPalette = [
    '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', 
    '#ffff00', '#00ffff', '#ff00ff', '#ff6600', '#6600ff',
    '#00cc99', '#cc0066', '#ffcc00', '#9900cc', '#66ff33'
  ];

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
                'downloadButton.border': '1px solid #007bff',
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
              },
              menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
              initMenu: 'filter',
              menuBarPosition: 'bottom',
            },
            cssMaxWidth: 700,
            cssMaxHeight: 500,
            selectionStyle: {
              cornerSize: 20,
              rotatingPointOffset: 70,
            },
            usageStatistics: false,
          });
          
          // Add custom fonts if needed
          tuiInstanceRef.current.registerIcons({
            'custom-icon': {
              'preset-1': 'path/to/icon.svg',
            }
          });

          // Load initial image if provided
          if (initialImageUrl) {
            loadImageFromUrl(initialImageUrl);
          }
        }
      } catch (error) {
        console.error('Failed to load TUI Image Editor:', error);
      }
    };

    loadEditor();

    return () => {
      if (tuiInstanceRef.current) {
        tuiInstanceRef.current.destroy();
        tuiInstanceRef.current = null;
      }
    };
  }, [initialImageUrl]);

  const loadImageFromUrl = async (url: string) => {
    try {
      // If URL is relative or needs proxying, use proxy
      const proxyUrl = url.startsWith('http') 
        ? `http://localhost:3000/proxy-image?url=${encodeURIComponent(url)}`
        : url;
        
      console.log(`[Canvas] Loading image from URL: ${proxyUrl}`);
      
      if (tuiInstanceRef.current) {
        // First try to load directly
        try {
          await tuiInstanceRef.current.loadImageFromURL(proxyUrl, 'user-upload');
          console.log('[Canvas] Image loaded successfully');
          setImageLoaded(true);
          return;
        } catch (directError) {
          console.warn('[Canvas] Direct load failed, trying with proxy:', directError);
        }

        // If direct load fails, try fetching via proxy first
        try {
          const response = await fetch(proxyUrl);
          const blob = await response.blob();
          const imageUrl = URL.createObjectURL(blob);
          
          await tuiInstanceRef.current.loadImageFromURL(imageUrl, 'user-upload');
          console.log('[Canvas] Image loaded successfully via blob');
          setImageLoaded(true);
          
          // Clean up the object URL
          URL.revokeObjectURL(imageUrl);
        } catch (proxyError) {
          console.error('[Canvas] Proxy load failed:', proxyError);
          throw proxyError;
        }
      }
    } catch (err) {
      console.error('[Canvas] Error loading image:', err);
      setNotification('Failed to load image. Please try uploading manually.');
    }
  };

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
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      if (tuiInstanceRef.current) {
        tuiInstanceRef.current.loadImageFromURL(imageUrl, 'user-upload')
          .then(() => {
            console.log('Image loaded successfully');
            setImageLoaded(true);
          })
          .catch((err: any) => {
            console.error('Error loading image:', err);
          });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    if (tuiInstanceRef.current) {
      // Set the color for drawing, text, or shapes based on active tool
      const activeMode = tuiInstanceRef.current.getDrawingMode();
      if (activeMode === 'TEXT') {
        tuiInstanceRef.current.setTextStyle({ fill: color });
      } else if (activeMode === 'SHAPE') {
        tuiInstanceRef.current.setShapeProperties({
          fill: color,
          stroke: color
        });
      } else {
        tuiInstanceRef.current.setBrush({
          width: 12,
          color: color
        });
      }
    }
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
            <label htmlFor="image-upload" className="upload-button">
              Upload Image
            </label>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden-input"
            />
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        {/* Color Palette */}
        <div className="color-palette-container">
          <button 
            className="color-picker-toggle"
            onClick={() => setColorPickerVisible(!colorPickerVisible)}
            style={{ backgroundColor: selectedColor }}
          >
            <span>Pick Color</span>
          </button>
          
          {colorPickerVisible && (
            <div className="color-palette">
              {colorPalette.map(color => (
                <div 
                  key={color}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorSelect(color)}
                />
              ))}
              <input 
                type="color" 
                value={selectedColor}
                onChange={(e) => handleColorSelect(e.target.value)}
                className="color-input"
              />
            </div>
          )}
        </div>
        
        <div className="tui-image-editor-container" ref={editorRef}></div>
        
        <div className="canvas-editor-footer">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          <button 
            className="schedule-button" 
            onClick={handleSchedule}
            disabled={!imageLoaded}
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