
// types/layout.ts

export type LayoutMode = 'single' | 'grid' | 'pip' | 'sidebar' | 'news' | 'speaker';

export interface SceneItem {
  id: string;
  sourceId: string; // Links to Participant ID or Media ID
  type: 'participant' | 'screenshare' | 'media' | 'image' | 'text';
  
  // Positioning (Percentage 0-100 for resolution independence)
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  
  // Visual State (WYSIWYG)
  fit?: 'cover' | 'contain';
  panX?: number; // 0-100 center point
  panY?: number; // 0-100 center point
  zoom?: number; // 1.0 - 3.0+
  
  // Styling
  borderRadius?: number;
  opacity?: number;
  border?: { width: number; color: string };
  shadow?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  mode: LayoutMode;
  items: SceneItem[];
  background: {
    type: 'color' | 'image' | 'video';
    value: string;
  };
  overlays: SceneItem[]; // Lower thirds, logos, tickers
}
