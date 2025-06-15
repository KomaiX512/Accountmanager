import React, { useEffect, useRef, useState, useCallback } from 'react';
import './CanvasEditor.css';
import { motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import 'tui-image-editor/dist/tui-image-editor.css';
import axios from 'axios';
import InstagramRequiredButton from './InstagramRequiredButton';
import TwitterRequiredButton from './TwitterRequiredButton';
import FacebookRequiredButton from './FacebookRequiredButton';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useFacebook } from '../../context/FacebookContext';
import { useLocation } from 'react-router-dom';
import { schedulePost } from '../../utils/scheduleHelpers';

interface CanvasEditorProps {
  onClose: () => void;
  username: string;
  userId?: string;
  initialImageUrl?: string;
  postKey?: string;
  postCaption?: string;
  platform?: 'instagram' | 'twitter' | 'facebook';
}

interface BrandElement {
  id: string;
  type: 'logo' | 'watermark' | 'contactInfo';
  url: string;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
}

interface ImageItem {
  id: string;
  url: string;
  file?: File;
  isProcessed: boolean;
  originalDimensions?: { width: number; height: number };
  processedUrl?: string;
}

const CanvasEditor: React.FC<CanvasEditorProps> = ({ 
  onClose, 
  username, 
  userId: propUserId, 
  initialImageUrl, 
  postKey, 
  postCaption, 
  platform: propPlatform
}) => {
  const location = useLocation();
  
  // Determine platform: use prop first, then detect from URL
  const detectedPlatform = propPlatform || (
    location.pathname.includes('twitter') ? 'twitter' : 
    location.pathname.includes('facebook') ? 'facebook' : 
    'instagram'
  );
  
  // Get userId from context if not provided as prop
  const { userId: instagramUserId, isConnected: isInstagramConnected } = useInstagram();
  const { userId: twitterUserId, isConnected: isTwitterConnected } = useTwitter();
  const { userId: facebookUserId, isConnected: isFacebookConnected } = useFacebook();
  
  // Determine platform-specific values based on detected platform
  const isConnected = detectedPlatform === 'twitter' ? isTwitterConnected : 
                     detectedPlatform === 'facebook' ? isFacebookConnected : isInstagramConnected;
  const contextUserId = detectedPlatform === 'twitter' ? twitterUserId : 
                       detectedPlatform === 'facebook' ? facebookUserId : instagramUserId;
  const userId = propUserId || (isConnected ? (contextUserId ?? undefined) : undefined);

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
  const [caption, setCaption] = useState(postCaption || ''); // Add state for caption
  
  // Brand Kit states
  const [brandKitMode, setBrandKitMode] = useState(false);
  const [brandElements, setBrandElements] = useState<BrandElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const brandCanvasRef = useRef<HTMLCanvasElement>(null);
  const [brandKitSaved, setBrandKitSaved] = useState(false);

  // Multi-image support states
  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [maxImages] = useState(10); // Maximum 10 images as requested
  const [isAutoSquareCrop, setIsAutoSquareCrop] = useState(true); // Auto-crop to square by default

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

  // Auto-crop image to square format
  const cropToSquare = async (imageUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        canvas.width = size;
        canvas.height = size;
        
        if (ctx) {
          // Calculate crop position to center the image
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          
          // Draw the cropped square image
          ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        }
        
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      
      img.src = imageUrl;
    });
  };

  // Process multiple image files
  const processImageFiles = async (files: FileList) => {
    const fileArray = Array.from(files);
    const remainingSlots = maxImages - images.length;
    
    if (fileArray.length > remainingSlots) {
      setNotification(`Can only add ${remainingSlots} more images (maximum ${maxImages} total)`);
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsProcessing(true);
    const newImages: ImageItem[] = [];

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        continue;
      }

      try {
        // Read file as data URL
        const reader = new FileReader();
        const imageUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        // Get original dimensions
        const img = new Image();
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          img.onload = () => resolve({ width: img.width, height: img.height });
          img.src = imageUrl;
        });

        // Auto-crop to square if enabled
        let processedUrl = imageUrl;
        if (isAutoSquareCrop && dimensions.width !== dimensions.height) {
          processedUrl = await cropToSquare(imageUrl);
        }

        const newImage: ImageItem = {
          id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url: imageUrl,
          file,
          isProcessed: isAutoSquareCrop && dimensions.width !== dimensions.height,
          originalDimensions: dimensions,
          processedUrl: processedUrl
        };

        newImages.push(newImage);
      } catch (error) {
        console.error('Error processing image file:', error);
        setNotification(`Failed to process ${file.name}`);
      }
    }

    setImages(prev => [...prev, ...newImages]);
    setIsProcessing(false);

          // Load the first new image if no image is currently loaded
      if (!imageLoaded && newImages.length > 0) {
        const indexToLoad = images.length; // Index of the first new image
        setCurrentImageIndex(indexToLoad);
        await loadImageIntoEditor(newImages[0].processedUrl || newImages[0].url);
      }
  };

  // Load specific image into the TUI editor
  const loadImageIntoEditor = async (imageUrl: string) => {
    if (!tuiInstanceRef.current) {
      console.warn('[Canvas] Editor not ready');
      return;
    }

    try {
      setIsProcessing(true);
      await tuiInstanceRef.current.loadImageFromURL(imageUrl, 'user-upload');
      setImageLoaded(true);
      console.log('[Canvas] Image loaded into editor successfully');
    } catch (error) {
      console.error('[Canvas] Error loading image into editor:', error);
      setNotification('Failed to load image into editor');
    } finally {
      setIsProcessing(false);
    }
  };

  // Switch to a different image
  const switchToImage = async (index: number) => {
    if (index < 0 || index >= images.length) return;
    
    setCurrentImageIndex(index);
    const image = images[index];
    await loadImageIntoEditor(image.processedUrl || image.url);
  };

  // Remove an image from the collection
  const removeImage = (index: number) => {
    if (images.length <= 1) {
      setNotification('Cannot remove the last image');
      return;
    }

    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);

    // Adjust current index if necessary
    if (index === currentImageIndex) {
      const newIndex = Math.min(currentImageIndex, newImages.length - 1);
      setCurrentImageIndex(newIndex);
      if (newImages[newIndex]) {
        loadImageIntoEditor(newImages[newIndex].processedUrl || newImages[newIndex].url);
      }
    } else if (index < currentImageIndex) {
      setCurrentImageIndex(prev => prev - 1);
    }
  };

  // Save the current editor state back to the current image
  const saveCurrentImageState = () => {
    if (!tuiInstanceRef.current || currentImageIndex < 0 || currentImageIndex >= images.length) {
      return;
    }

    try {
      const editedImageUrl = tuiInstanceRef.current.toDataURL();
      const updatedImages = [...images];
      updatedImages[currentImageIndex] = {
        ...updatedImages[currentImageIndex],
        processedUrl: editedImageUrl,
        isProcessed: true
      };
      setImages(updatedImages);
    } catch (error) {
      console.error('[Canvas] Error saving current image state:', error);
    }
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
                'colorpicker.button.border': '1px solid #ddd',
                'colorpicker.title.color': '#fff',
                'colorpicker.primary.color': '#00ffcc'
              } as any,
              menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
              initMenu: 'filter',
              menuBarPosition: 'left',
              uiSize: {
                width: '1000px',
                height: '100%'
              },
            },
            cssMaxWidth: 1000,
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
        
        // Create initial image item
        const initialImage: ImageItem = {
          id: 'initial_image',
          url: initialImageUrl,
          isProcessed: false
        };
        
        setImages([initialImage]);
        setCurrentImageIndex(0);
        await loadImageIntoEditor(initialImageUrl);
      }
    };

    loadInitialImage();
  }, [initialImageUrl, isEditorReady]);

  // Brand Kit Load/Save functions
  useEffect(() => {
    // Load saved brand kit if exists
    const loadBrandKit = async () => {
      if (userId) {
        try {
          // In a real implementation, this would fetch from API
          const savedBrandKit = localStorage.getItem(`brandKit_${userId}`);
          if (savedBrandKit) {
            setBrandElements(JSON.parse(savedBrandKit));
            setBrandKitSaved(true);
          }
        } catch (error) {
          console.error('[BrandKit] Failed to load brand kit:', error);
        }
      }
    };
    
    loadBrandKit();
  }, [userId]);

  // Initialize brand canvas when brand kit mode is activated
  useEffect(() => {
    if (brandKitMode && brandCanvasRef.current) {
      const canvas = brandCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Set canvas dimensions
        canvas.width = 800;
        canvas.height = 600;
        
        // Draw black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw existing brand elements
        renderBrandElements(ctx);
      }
    }
  }, [brandKitMode, brandElements]);

  // Render brand elements on the canvas
  const renderBrandElements = (ctx: CanvasRenderingContext2D) => {
    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw each brand element
    brandElements.forEach(element => {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        
        // Position at element's coordinates
        ctx.translate(element.position.x, element.position.y);
        
        // Apply rotation (convert to radians)
        ctx.rotate((element.rotation * Math.PI) / 180);
        
        // Apply opacity
        ctx.globalAlpha = element.opacity;
        
        // Draw the image (centered at position)
        const width = img.width * element.scale;
        const height = img.height * element.scale;
        ctx.drawImage(img, -width/2, -height/2, width, height);
        
        ctx.restore();
        
        // Highlight selected element with extra controls
        if (element.id === selectedElement) {
          // Draw selection box
          ctx.save();
          
          // Position at element's coordinates
          ctx.translate(element.position.x, element.position.y);
          ctx.rotate((element.rotation * Math.PI) / 180);
          
          // Draw bounding box
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.strokeRect(-width/2, -height/2, width, height);
          
          // Draw rotation handles at corners
          ctx.setLineDash([]);
          
          // Rotation handle at top-right
          const handleSize = 8;
          ctx.fillStyle = '#00ff00';
          ctx.fillRect(width/2 - handleSize/2, -height/2 - handleSize/2, handleSize, handleSize);
          
          // Draw rotation handle at bottom-right
          ctx.fillRect(width/2 - handleSize/2, height/2 - handleSize/2, handleSize, handleSize);
          
          // Draw rotation handle at bottom-left
          ctx.fillRect(-width/2 - handleSize/2, height/2 - handleSize/2, handleSize, handleSize);
          
          // Draw rotation handle at top-left
          ctx.fillRect(-width/2 - handleSize/2, -height/2 - handleSize/2, handleSize, handleSize);
          
          // Draw rotation indicator line
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -height/2 - 20);
          ctx.strokeStyle = '#00ff00';
          ctx.stroke();
          
          // Draw rotation handle circle at the end of the line
          ctx.beginPath();
          ctx.arc(0, -height/2 - 20, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ffff00';
          ctx.fill();
          ctx.strokeStyle = '#00ff00';
          ctx.stroke();
          
          ctx.restore();
          
          // Draw guidance text
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.fillText('Drag to move, drag yellow handle to rotate', 10, ctx.canvas.height - 20);
          ctx.fillText('Hold SHIFT while rotating to scale', 10, ctx.canvas.height - 5);
          ctx.restore();
        }
      };
      img.src = element.url;
    });
  };

  // Toggle brand kit mode
  const toggleBrandKit = () => {
    const newMode = !brandKitMode;
    setBrandKitMode(newMode);
    
    // When entering brand kit mode
    if (newMode) {
      // Store current editor state if needed
      console.log('[BrandKit] Entering brand kit mode');
      
      // Initialize the brand canvas if not done already
      setTimeout(() => {
        if (brandCanvasRef.current) {
          const canvas = brandCanvasRef.current;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Set canvas dimensions
            canvas.width = 800;
            canvas.height = 600;
            
            // Draw black background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw existing brand elements
            renderBrandElements(ctx);
          }
        }
      }, 50);
    } else {
      // When exiting brand kit mode
      console.log('[BrandKit] Exiting brand kit mode');
      
      // Restore editor state if needed
      if (tuiInstanceRef.current) {
        // Make sure editor is visible again
        const editorContainer = document.querySelector('.tui-image-editor-container');
        if (editorContainer) {
          (editorContainer as HTMLElement).style.display = 'block';
        }
      }
    }
  };
  
  // Add new brand element
  const addBrandElement = async (type: 'logo' | 'watermark' | 'contactInfo') => {
    // Open file picker to select image
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        // Convert file to data URL
        const reader = new FileReader();
        reader.onload = (event) => {
          const url = event.target?.result as string;
          
          // Create new element
          const newElement: BrandElement = {
            id: `element_${Date.now()}`,
            type,
            url,
            position: { x: 400, y: 300 }, // Center of canvas
            scale: 0.5,
            rotation: 0,
            opacity: 1.0
          };
          
          // Add to brand elements array
          setBrandElements([...brandElements, newElement]);
          
          // Select new element
          setSelectedElement(newElement.id);
        };
        
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('[BrandKit] Failed to add brand element:', error);
        setNotification('Failed to add brand element. Please try again.');
      }
    };
    
    input.click();
  };
  
  // Update brand element properties
  const updateBrandElement = (id: string, updates: Partial<BrandElement>) => {
    setBrandElements(elements => 
      elements.map(el => 
        el.id === id ? { ...el, ...updates } : el
      )
    );
  };
  
  // Remove brand element
  const removeBrandElement = (id: string) => {
    setBrandElements(elements => elements.filter(el => el.id !== id));
    if (selectedElement === id) {
      setSelectedElement(null);
    }
  };
  
  // Save brand kit configuration
  const saveBrandKit = () => {
    if (userId) {
      try {
        // In a real implementation, this would save to an API
        localStorage.setItem(`brandKit_${userId}`, JSON.stringify(brandElements));
        setBrandKitSaved(true);
        setNotification('Brand kit saved successfully!');
        setTimeout(() => setNotification(null), 3000);
      } catch (error) {
        console.error('[BrandKit] Failed to save brand kit:', error);
        setNotification('Failed to save brand kit. Please try again.');
      }
    } else {
      setNotification('Please connect your Instagram account to save brand kit');
    }
  };
  
  // Apply brand kit to current image
  const applyBrandKit = async () => {
    if (!tuiInstanceRef.current) {
      setNotification('Editor not ready. Please try again.');
      return;
    }
    
    if (brandElements.length === 0) {
      setNotification('Please add at least one brand element first');
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Get the current image from the editor
      const currentImageDataUrl = tuiInstanceRef.current.toDataURL();
      
      // Create a temporary canvas for overlaying brand elements
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Load the current image to get dimensions
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = currentImageDataUrl;
      });
      
      // Set canvas dimensions to match image
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      
      // Draw the current image as background
      ctx.drawImage(img, 0, 0);
      
      // Apply each brand element
      for (const element of brandElements) {
        const elementImg = new Image();
        await new Promise((resolve, reject) => {
          elementImg.onload = resolve;
          elementImg.onerror = reject;
          elementImg.src = element.url;
        });
        
        // Calculate position based on relative percentages instead of absolute pixels
        const positionRatio = {
          x: element.position.x / 800, // Convert position to percentage (800 is brand canvas width)
          y: element.position.y / 600  // Convert position to percentage (600 is brand canvas height)
        };

        // Calculate actual position in pixels on the target image
        const x = img.width * positionRatio.x;
        const y = img.height * positionRatio.y;
        
        // Calculate dimensions while preserving original scale
        const originalWidth = elementImg.width * element.scale;
        const originalHeight = elementImg.height * element.scale;
        
        ctx.save();
        
        // Translate to the position
        ctx.translate(x, y);
        
        // Apply rotation
        ctx.rotate((element.rotation * Math.PI) / 180);
        
        // Apply opacity
        ctx.globalAlpha = element.opacity;
        
        // Draw the element centered at its position, maintaining original dimensions
        ctx.drawImage(
          elementImg, 
          -originalWidth / 2,  // Center horizontally
          -originalHeight / 2, // Center vertically
          originalWidth,
          originalHeight
        );
        
        ctx.restore();
      }
      
      // Load the composite image back into the editor
      const compositeImageDataUrl = tempCanvas.toDataURL();
      await tuiInstanceRef.current.loadImageFromURL(compositeImageDataUrl, 'branded-image');
      
      // Success notification
      setNotification('Brand kit applied successfully!');
      setTimeout(() => setNotification(null), 3000);
      
      // Exit brand kit mode
      setBrandKitMode(false);
    } catch (error) {
      console.error('[BrandKit] Failed to apply brand kit:', error);
      setNotification('Failed to apply brand kit. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Handle brand canvas mouse events for element manipulation
  const handleBrandCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!brandCanvasRef.current || !selectedElement) return;
    
    const canvas = brandCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Find the selected element
    const element = brandElements.find(el => el.id === selectedElement);
    if (!element) return;
    
    // Determine which type of operation we're doing based on the mouse position
    // Calculate distance from element center to determine operation
    const dx = x - element.position.x;
    const dy = y - element.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Get the element's current dimensions 
    const img = new Image();
    img.src = element.url;
    
    // Check if we're on a control handle or on the main element body
    const handleSize = 15; // Size of the rotation/scale handles in pixels
    const isOnRotationHandle = distance > (img.width * element.scale / 2) - handleSize && 
                              distance < (img.width * element.scale / 2) + handleSize;
    
    // Starting angle for rotation
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    // Starting scale
    const startScale = element.scale;
    // Starting position
    const startPos = { ...element.position };
    
    // Track operation type
    const operationType = isOnRotationHandle ? 'rotate' : 'move';
    
    const mouseMoveHandler = (moveEvent: MouseEvent) => {
      const newX = moveEvent.clientX - rect.left;
      const newY = moveEvent.clientY - rect.top;
      
      if (operationType === 'rotate') {
        // Calculate new angle
        const newDx = newX - element.position.x;
        const newDy = newY - element.position.y;
        const newAngle = Math.atan2(newDy, newDx) * (180 / Math.PI);
        
        // Calculate angle difference and apply to rotation
        const angleDiff = newAngle - startAngle;
        let newRotation = (element.rotation + angleDiff) % 360;
        if (newRotation < 0) newRotation += 360;
        
        // Update element rotation
        updateBrandElement(selectedElement, {
          rotation: newRotation
        });
        
        // If key is pressed, also scale based on distance from center
        if (moveEvent.shiftKey) {
          const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
          const distanceRatio = newDistance / distance;
          
          // Apply scaling but with reasonable limits
          const newScale = Math.max(0.1, Math.min(3, startScale * distanceRatio));
          
          updateBrandElement(selectedElement, {
            scale: newScale
          });
        }
      } else {
        // Regular move operation
        updateBrandElement(selectedElement, {
          position: { x: newX, y: newY }
        });
      }
    };
    
    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
    
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  };

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
      
      // Try direct loading first, only use proxy as fallback
      let imageUrl = '';
      let blob: Blob | null = null;
      
      // First try: Use a CORS proxy directly
      try {
        console.log(`[Canvas] Attempting to load image via CORS proxy: ${url}`);
        const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const corsResponse = await fetch(corsProxyUrl, { 
          mode: 'cors',
          headers: {
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
          }
        });
        
        if (corsResponse.ok) {
          blob = await corsResponse.blob();
          imageUrl = URL.createObjectURL(blob);
          console.log('[Canvas] Successfully loaded image via CORS proxy');
        } else {
          console.warn(`[Canvas] CORS proxy failed with status: ${corsResponse.status}`);
        }
      } catch (corsError) {
        console.warn('[Canvas] CORS proxy attempt failed:', corsError);
      }
      
      // Second try: Use our server proxy
      if (!imageUrl) {
        try {
          console.log('[Canvas] Attempting to load image via server proxy');
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}&fallback=pixel`;
          
          const response = await fetch(proxyUrl);
          if (response.ok) {
            blob = await response.blob();
            imageUrl = URL.createObjectURL(blob);
            console.log('[Canvas] Successfully loaded image via server proxy');
          } else {
            console.error(`[Canvas] Server proxy failed with status: ${response.status} ${response.statusText}`);
          }
        } catch (proxyError) {
          console.error('[Canvas] Server proxy attempt failed:', proxyError);
        }
      }
      
      // Final attempt: Try loading directly (might work for some public images)
      if (!imageUrl) {
        try {
          console.log('[Canvas] Attempting direct image load as last resort');
          const directResponse = await fetch(url, { 
            mode: 'no-cors',
            cache: 'no-cache' 
          });
          
          // Note: With no-cors, we might not get a proper blob, but let's try
          try {
            blob = await directResponse.blob();
            imageUrl = URL.createObjectURL(blob);
            console.log('[Canvas] Successfully loaded image directly');
          } catch (blobError) {
            console.warn('[Canvas] Failed to get blob from direct image load:', blobError);
          }
        } catch (directError) {
          console.error('[Canvas] Direct image load failed:', directError);
        }
      }
      
      // If all methods failed, create a blank canvas
      if (!imageUrl) {
        console.warn('[Canvas] All image loading methods failed, creating blank canvas');
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Add text indicating image failed to load
          ctx.font = '16px Arial';
          ctx.fillStyle = '#999999';
          ctx.textAlign = 'center';
          ctx.fillText('Image could not be loaded', canvas.width / 2, canvas.height / 2);
          ctx.fillText('Click here to upload an image manually', canvas.width / 2, canvas.height / 2 + 30);
        }
        imageUrl = canvas.toDataURL();
        console.log('[Canvas] Created fallback blank canvas');
      }
      
      // Wait for any ongoing operations to complete
      setTimeout(async () => {
        try {
          await tuiInstanceRef.current.loadImageFromURL(imageUrl, 'user-upload');
          console.log('[Canvas] Image loaded successfully');
          setImageLoaded(true);
          
          // Always enable Brand Kit after image is loaded (regardless of source)
          setIsEditorReady(true);
          
          // Clean up the object URL
          if (blob) {
            URL.revokeObjectURL(imageUrl);
          }
        } catch (error) {
          console.error('[Canvas] Error loading image into editor:', error);
          setNotification('Failed to load image. Please try uploading manually.');
          setIsProcessing(false);
        }
      }, 100);
    } catch (err) {
      console.error('[Canvas] Error in loadImageFromUrl:', err);
      setNotification('Failed to load image. Try uploading manually.');
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
      // Get image from canvas if available
      let imageBlob: Blob | undefined = undefined;
      
      if (imageLoaded && tuiInstanceRef.current) {
        try {
          const imageDataUrl = tuiInstanceRef.current.toDataURL();
          imageBlob = await fetch(imageDataUrl).then(r => r.blob());
          console.log(`[CanvasEditor] Canvas image captured for ${detectedPlatform} scheduling`);
        } catch (imageError) {
          console.warn(`[CanvasEditor] Failed to get canvas image:`, imageError);
          if (detectedPlatform === 'instagram') {
            throw new Error('Instagram posts require an image');
          }
        }
      } else if (detectedPlatform === 'instagram') {
        throw new Error('Instagram posts require an image');
      }
      
      // Use smart reusable schedule helper
      const result = await schedulePost({
        platform: detectedPlatform,
        userId,
        imageBlob,
        caption: caption || postCaption || '',
        scheduleTime: scheduleDate,
        postKey
      });
      
      setNotification(result.message);
      
      if (!result.success) {
        setIsScheduling(false);
        return;
      }
      
      // Close the scheduler after 2 seconds
      setTimeout(() => {
        setShowScheduler(false);
        // Close the editor after another second
        setTimeout(onClose, 1000);
      }, 2000);
    } catch (error) {
      console.error('Error scheduling post:', error);
      setNotification(`Failed to schedule ${detectedPlatform === 'twitter' ? 'tweet' : 'post'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  // Enhanced file upload handler for multiple images
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !isEditorReady) return;

    processImageFiles(files);
  };

  // Save edited post back to the Cook-Post module
  const saveEditedPost = async () => {
    if (!tuiInstanceRef.current || !postKey) {
      setNotification('Cannot save: missing editor or post key');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Get the edited image as blob
      const editedImageDataUrl = tuiInstanceRef.current.toDataURL();
      const editedImageBlob = await fetch(editedImageDataUrl).then(r => r.blob());
      
      // Create form data to send to server
      const formData = new FormData();
      formData.append('image', editedImageBlob, `edited_${postKey}.jpg`);
      formData.append('postKey', postKey);
      formData.append('caption', caption || postCaption || '');
      formData.append('platform', detectedPlatform);
      
      // Send to server to update the post
      const response = await fetch(`http://localhost:3000/api/save-edited-post/${username}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save edited post');
      }
      
      const result = await response.json();
      setNotification('Post saved successfully!');
      
      // INSTANT UPDATE: Trigger immediate cache busting event
      window.dispatchEvent(new CustomEvent('postUpdated', { 
        detail: { 
          postKey, 
          platform: detectedPlatform,
          timestamp: Date.now(),
          action: 'edited'
        } 
      }));
      
      setTimeout(() => {
        onClose(); // Close the editor
      }, 1500);
      
    } catch (error) {
      console.error('[Canvas] Error saving edited post:', error);
      setNotification('Failed to save edited post. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle brand canvas keyboard events
  useEffect(() => {
    if (!brandKitMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedElement) {
        // Remove the selected element
        removeBrandElement(selectedElement);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [brandKitMode, selectedElement]);

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
          <h2>{detectedPlatform === 'twitter' ? 'Tweet Editor' : 'Image Editor'}</h2>
          <div className="canvas-upload-container">
            <label htmlFor="image-upload" className={`upload-button ${isProcessing ? 'disabled' : ''}`}>
              {images.length > 0 ? 'Add More Images' : 'Upload Images'}
            </label>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden-input"
              disabled={isProcessing || !isEditorReady}
              multiple // Enable multiple file selection
            />
            
            {/* Auto Square Crop Toggle */}
            <label className="auto-crop-toggle">
              <input
                type="checkbox"
                checked={isAutoSquareCrop}
                onChange={(e) => setIsAutoSquareCrop(e.target.checked)}
              />
              Auto Square Crop
            </label>

            {/* Image Counter */}
            {images.length > 0 && (
              <span className="image-counter">
                {images.length}/{maxImages} images
              </span>
            )}
            
            {/* Brand Kit Button with Tooltip */}
            <button 
              className={`brand-kit-button ${brandKitMode ? 'active' : ''}`}
              onClick={toggleBrandKit}
              title="Auto-apply your saved branding layout — logo, watermark, and contact info — across all uploaded images."
            >
              {brandKitMode ? 'Exit Brand Kit' : 'Apply Brand Kit'}
            </button>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {/* Multi-Image Preview Panel */}
        {images.length > 1 && !brandKitMode && (
          <div className="multi-image-panel">
            <div className="image-preview-header">
              <h3>Images ({images.length})</h3>
              <button 
                className="save-current-button"
                onClick={saveCurrentImageState}
                disabled={isProcessing}
              >
                Save Current Edits
              </button>
            </div>
            <div className="image-preview-grid">
              {images.map((image, index) => (
                <div 
                  key={image.id} 
                  className={`image-preview-item ${index === currentImageIndex ? 'active' : ''}`}
                  onClick={() => switchToImage(index)}
                >
                  <img 
                    src={image.processedUrl || image.url} 
                    alt={`Image ${index + 1}`}
                    className="preview-thumbnail"
                  />
                  <div className="preview-overlay">
                    <span className="preview-index">{index + 1}</span>
                    {image.isProcessed && (
                      <span className="processed-indicator" title="Auto-cropped to square">■</span>
                    )}
                    <button 
                      className="remove-image-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(index);
                      }}
                      disabled={images.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                  {index === currentImageIndex && (
                    <div className="current-indicator">Editing</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Brand Kit Canvas (only shown in brand kit mode) */}
        {brandKitMode && (
          <div className="brand-kit-container">
            <div className="brand-canvas-wrapper">
              <canvas 
                ref={brandCanvasRef} 
                className="brand-canvas"
                onMouseDown={handleBrandCanvasMouseDown}
                width="800" 
                height="600"
              />
              
              {/* Keyboard shortcuts reference */}
              <div className="brand-kit-keyboard-shortcuts">
                <ul>
                  <li><span className="key">Drag</span> Move selected element</li>
                  <li><span className="key">Drag Handle</span> Rotate element</li>
                  <li><span className="key">Shift + Drag</span> Scale element while rotating</li>
                  <li><span className="key">Delete</span> Remove selected element</li>
                </ul>
              </div>
            </div>
            
            <div className="brand-kit-sidebar">
              <h3>Brand Kit Editor</h3>
              
              <div className="brand-kit-controls">
                <div className="brand-kit-add-element">
                  <button 
                    className="brand-element-add-button"
                    onClick={() => addBrandElement('logo')}
                  >
                    + Add Branding Element
                  </button>
                  
                  <select 
                    className="brand-element-type-select"
                    onChange={(e) => {
                      const type = e.target.value as 'logo' | 'watermark' | 'contactInfo';
                      if (type) {
                        addBrandElement(type);
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Select Element Type</option>
                    <option value="logo">Logo</option>
                    <option value="watermark">Watermark</option>
                    <option value="contactInfo">Contact Info</option>
                  </select>
                </div>
                
                {/* List of current brand elements */}
                <div className="brand-elements-list">
                  <h4>Current Elements</h4>
                  {brandElements.length === 0 ? (
                    <p className="no-elements-message">No elements added yet</p>
                  ) : (
                    <ul>
                      {brandElements.map(element => (
                        <li 
                          key={element.id}
                          className={`brand-element-item ${selectedElement === element.id ? 'selected' : ''}`}
                          onClick={() => setSelectedElement(element.id)}
                        >
                          <span>{element.type}</span>
                          <button 
                            className="remove-element-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBrandElement(element.id);
                            }}
                          >
                            &times;
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                {/* Element Properties (only shown when an element is selected) */}
                {selectedElement && (
                  <div className="element-properties">
                    <h4>Element Properties</h4>
                    
                    {brandElements.filter(e => e.id === selectedElement).map(element => (
                      <div key={element.id} className="properties-container">
                        <div className="property-group">
                          <label>Opacity:</label>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={element.opacity}
                            onChange={(e) => {
                              updateBrandElement(element.id, {
                                opacity: parseFloat(e.target.value)
                              });
                            }}
                          />
                          <span>{Math.round(element.opacity * 100)}%</span>
                        </div>
                        
                        <div className="property-group">
                          <label>Scale:</label>
                          <input 
                            type="range"
                            min="0.1"
                            max="2"
                            step="0.05"
                            value={element.scale}
                            onChange={(e) => {
                              updateBrandElement(element.id, {
                                scale: parseFloat(e.target.value)
                              });
                            }}
                          />
                          <span>{Math.round(element.scale * 100)}%</span>
                        </div>
                        
                        <div className="property-group">
                          <label>Rotation:</label>
                          <input 
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                            value={element.rotation}
                            onChange={(e) => {
                              updateBrandElement(element.id, {
                                rotation: parseInt(e.target.value)
                              });
                            }}
                          />
                          <span>{element.rotation}°</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="brand-kit-actions">
                  <button 
                    className="save-brand-kit-button"
                    onClick={saveBrandKit}
                    disabled={brandElements.length === 0}
                  >
                    Save Brand Kit
                  </button>
                  
                  <button 
                    className="apply-brand-kit-button"
                    onClick={applyBrandKit}
                    disabled={brandElements.length === 0 || !imageLoaded}
                  >
                    Apply to Current Image
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Main TUI Image Editor (hidden when in brand kit mode) */}
        <div 
          className="tui-image-editor-container" 
          ref={editorRef}
          style={{ display: brandKitMode ? 'none' : 'block' }}
        >
          {isProcessing && (
            <div className="editor-loading-overlay">
              <div className="editor-loading-spinner">Loading...</div>
            </div>
          )}
        </div>
        
        <div className="canvas-editor-footer">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          
          {/* Save button for edited posts */}
          {postKey && (
            <button 
              className="save-edit-button" 
              onClick={saveEditedPost}
              disabled={!imageLoaded || isProcessing}
              style={{ 
                backgroundColor: '#28a745',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: imageLoaded && !isProcessing ? 'pointer' : 'not-allowed',
                opacity: imageLoaded && !isProcessing ? 1 : 0.5,
                marginRight: '8px'
              }}
            >
              {isProcessing ? 'Saving...' : 'Save Changes'}
            </button>
          )}

          {brandKitMode ? (
            <button 
              className="exit-brand-kit-button"
              onClick={toggleBrandKit}
            >
              Exit Brand Kit
            </button>
          ) : (
            detectedPlatform === 'twitter' ? (
              <TwitterRequiredButton
                isConnected={isTwitterConnected}
                onClick={handleSchedule}
                className="schedule-button"
                disabled={isProcessing}
                style={{ 
                  backgroundColor: '#1da1f2',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: !isProcessing ? 'pointer' : 'not-allowed',
                  opacity: !isProcessing ? 1 : 0.5
                }}
              >
                Schedule
              </TwitterRequiredButton>
            ) : detectedPlatform === 'facebook' ? (
              <FacebookRequiredButton
                isConnected={isFacebookConnected}
                onClick={handleSchedule}
                className="schedule-button"
                disabled={isProcessing}
                style={{ 
                  backgroundColor: '#3b5998',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: !isProcessing ? 'pointer' : 'not-allowed',
                  opacity: !isProcessing ? 1 : 0.5
                }}
              >
                Schedule
              </FacebookRequiredButton>
            ) : (
              <InstagramRequiredButton
                isConnected={isInstagramConnected}
                onClick={handleSchedule}
                className="schedule-button"
                disabled={!imageLoaded || isProcessing}
                style={{ 
                  backgroundColor: '#007bff',
                  color: '#e0e0ff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: imageLoaded && !isProcessing ? 'pointer' : 'not-allowed',
                  opacity: imageLoaded && !isProcessing ? 1 : 0.5
                }}
              >
                Schedule
              </InstagramRequiredButton>
            )
          )}
        </div>
        
        {showScheduler && (
          <div className="scheduler-overlay">
            <div className="scheduler-container">
              <h3>Schedule Your {detectedPlatform === 'twitter' ? 'Tweet' : 'Post'}</h3>
              
              <div className="caption-container">
                <label htmlFor="post-caption">{detectedPlatform === 'twitter' ? 'Tweet Text:' : 'Caption:'}</label>
                <textarea
                  id="post-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={detectedPlatform === 'twitter' ? "What's happening?" : "Write your caption here... (include any hashtags)"}
                  rows={4}
                  className="caption-input"
                  maxLength={detectedPlatform === 'twitter' ? 280 : 2200}
                />
                <p className="caption-count">
                  {caption.length}/{detectedPlatform === 'twitter' ? 280 : 2200} characters
                  {detectedPlatform === 'twitter' && caption.length > 280 && (
                    <span style={{ color: '#ff4444', marginLeft: '8px' }}>
                      Tweet exceeds character limit!
                    </span>
                  )}
                </p>
                {detectedPlatform === 'twitter' && imageLoaded && (
                  <p style={{ color: '#1da1f2', fontSize: '14px', marginTop: '8px' }}>
                    ✓ Image will be included with your tweet
                  </p>
                )}
                {detectedPlatform === 'twitter' && !imageLoaded && (
                  <p style={{ color: '#666', fontSize: '14px', marginTop: '8px' }}>
                    Text-only tweet (no image)
                  </p>
                )}
              </div>
              
              <p>Select date and time to publish your {detectedPlatform === 'twitter' ? 'tweet' : 'post'}:</p>
              
              <DatePicker 
                selected={scheduleDate}
                onChange={(date: Date | null) => setScheduleDate(date)}
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
                  {isScheduling ? `Scheduling ${detectedPlatform === 'twitter' ? 'Tweet' : 'Post'}...` : `Confirm Schedule ${detectedPlatform === 'twitter' ? 'Tweet' : 'Post'}`}
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