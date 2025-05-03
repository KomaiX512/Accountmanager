declare module 'tui-image-editor' {
  interface LoadImageOptions {
    path: string;
    name: string;
  }

  interface ThemeOptions {
    [key: string]: string;
  }

  interface UIOptions {
    loadImage: LoadImageOptions;
    theme?: ThemeOptions;
    menu?: string[];
    initMenu?: string;
    menuBarPosition?: string;
    uiSize?: {
      width: string;
      height: string;
    };
  }

  interface SelectionStyle {
    cornerSize?: number;
    rotatingPointOffset?: number;
  }

  interface ImageEditorOptions {
    includeUI?: UIOptions;
    cssMaxWidth?: number;
    cssMaxHeight?: number;
    usageStatistics?: boolean;
    selectionStyle?: SelectionStyle;
  }

  interface IconOptions {
    [key: string]: {
      [key: string]: string;
    };
  }

  class ImageEditor {
    constructor(element: HTMLElement, options: ImageEditorOptions);
    
    loadImageFromURL(imageUrl: string, imageName: string): Promise<void>;
    toDataURL(): string;
    destroy(): void;
    registerIcons(iconOptions: IconOptions): void;
  }

  export default ImageEditor;
} 