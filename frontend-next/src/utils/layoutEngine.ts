'use client';


import { Scene, SceneItem, LayoutMode } from '../types/layout';

interface LayoutConfig {
    width: number;
    height: number;
    gap: number;
    margin: number;
}

interface LayoutInput {
    participants: { id: string; isScreen?: boolean }[];
    screenShareId?: string;
    mode: LayoutMode;
    viewPrefs?: Record<string, { fit: 'contain' | 'cover', pan: { x: number; y: number }, zoom: number }>;
}

/**
 * Calculates a unified Scene object used by both the React Preview (DOM) 
 * and the Broadcast Engine (WebGL).
 */
export function calculateLayout(
    input: LayoutInput, 
    config: LayoutConfig = { width: 1920, height: 1080, gap: 16, margin: 16 }
): Scene {
    const { participants, screenShareId, mode, viewPrefs } = input;
    const items: SceneItem[] = [];
    
    // Normalize gap/margin to percentages relative to canvas size
    const gapX = (config.gap / config.width) * 100;
    const gapY = (config.gap / config.height) * 100;
    const marginX = (config.margin / config.width) * 100;
    const marginY = (config.margin / config.height) * 100;

    const availableW = 100 - (2 * marginX);
    const availableH = 100 - (2 * marginY);

    // Filter valid sources
    const sources = participants.map(p => ({
        id: p.id,
        isScreen: p.id === screenShareId || p.isScreen
    }));

    if (sources.length === 0) {
        return createEmptyScene();
    }

    // --- Layout Logic ---

    if (mode === 'pip' && sources.length > 1) {
        // PIP Mode: First item (or screen) is background, second is floating
        const main = sources.find(s => s.isScreen) || sources[0];
        const pip = sources.find(s => s.id !== main.id) || sources[1];

        items.push(createItem(main.id, 0, 0, 100, 100, 0, viewPrefs));
        
        // PIP bottom-right
        const pipW = 20;
        const pipH = (pipW * 9) / 16; // Maintain 16:9 aspect roughly
        items.push(createItem(pip.id, 100 - pipW - marginX, 100 - pipH - marginY, pipW, pipH, 10, viewPrefs, true));

    } else if (mode === 'single' || (mode === 'speaker' && sources.length === 1)) {
        // Single Fullscreen
        const target = sources.find(s => s.isScreen) || sources[0];
        items.push(createItem(target.id, 0, 0, 100, 100, 0, viewPrefs));

    } else if (mode === 'speaker' && sources.length > 1) {
        // Speaker Mode: Main stage left/top, strip right/bottom
        // Layout: Main takes 80% width, Strip takes 20%
        const main = sources.find(s => s.isScreen) || sources[0];
        const others = sources.filter(s => s.id !== main.id);

        const mainW = 80 - gapX;
        items.push(createItem(main.id, marginX, marginY, mainW, availableH, 0, viewPrefs));

        const stripW = 20;
        const stripItemH = availableH / others.length;
        
        others.forEach((p, idx) => {
            const y = marginY + (idx * stripItemH);
            // Apply gap between strip items if multiple
            const h = stripItemH - (idx < others.length - 1 ? gapY : 0);
            items.push(createItem(p.id, marginX + mainW + gapX, y, stripW, h, 1, viewPrefs));
        });

    } else {
        // Grid Mode (Default)
        const count = sources.length;
        let cols = 1;
        if (count > 1) cols = 2;
        if (count > 4) cols = 3;
        if (count > 9) cols = 4;

        const rows = Math.ceil(count / cols);
        
        // Calculate cell dimensions accounting for gaps
        // Total Gaps X = (cols - 1) * gapX
        const totalGapX = (cols - 1) * gapX;
        const cellW = (availableW - totalGapX) / cols;
        
        const totalGapY = (rows - 1) * gapY;
        const cellH = (availableH - totalGapY) / rows;

        sources.forEach((p, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);

            const x = marginX + (col * (cellW + gapX));
            const y = marginY + (row * (cellH + gapY));

            items.push(createItem(p.id, x, y, cellW, cellH, 1, viewPrefs));
        });
    }

    return {
        id: `scene-${Date.now()}`,
        name: 'Auto Generated',
        mode,
        items,
        background: { type: 'color', value: '#000000' },
        overlays: []
    };
}

function createItem(
    id: string, 
    x: number, y: number, w: number, h: number, 
    zIndex: number,
    viewPrefs?: Record<string, any>,
    hasBorder = false
): SceneItem {
    const pref = viewPrefs?.[id] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 };
    
    return {
        id,
        sourceId: id,
        type: 'participant', // Simplified for engine
        x, y, width: w, height: h,
        zIndex,
        fit: pref.fit,
        panX: pref.pan.x,
        panY: pref.pan.y,
        zoom: pref.zoom,
        border: hasBorder ? { width: 2, color: '#ffffff' } : undefined,
        borderRadius: 12 // Consistent styling
    };
}

function createEmptyScene(): Scene {
    return {
        id: 'empty',
        name: 'Empty',
        mode: 'grid',
        items: [],
        background: { type: 'color', value: '#000000' },
        overlays: []
    };
}
