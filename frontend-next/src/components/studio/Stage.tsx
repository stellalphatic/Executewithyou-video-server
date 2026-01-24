'use client';

/**
 * Stage Component - Main broadcasting canvas with layout rendering
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { Monitor, MicOff, Minus, Plus as PlusIcon } from 'lucide-react';
import { useStudioStore, selectActiveBrand, selectVisibleBanners } from '@/stores/studioStore';
import { VideoFeed } from './VideoFeed';
import { DraggableOverlay } from './DraggableOverlay';
import { calculateLayout } from '@/utils/layoutEngine';
import { Participant } from '@/types';

interface StageProps {
  localStream: MediaStream | null;
  processedStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  onContextMenu: (e: React.MouseEvent, participantId: string) => void;
}

export function Stage({
  localStream,
  processedStream,
  screenStream,
  remoteStreams,
  onContextMenu,
}: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingCropId = useRef<string | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Store selectors
  const onStageParticipants = useStudioStore((s) => s.onStageParticipants);
  const layoutState = useStudioStore((s) => s.layoutState);
  const layoutLocked = useStudioStore((s) => s.layoutLocked);
  const viewPreferences = useStudioStore((s) => s.viewPreferences);
  const stageBackground = useStudioStore((s) => s.stageBackground);
  const activeBrand = useStudioStore(selectActiveBrand);
  const visibleBanners = useStudioStore(selectVisibleBanners);
  
  // Actions
  const setViewPreference = useStudioStore((s) => s.setViewPreference);
  const updateBanner = useStudioStore((s) => s.updateBanner);
  const updateBrand = useStudioStore((s) => s.updateBrand);

  // Calculate unified scene layout
  const unifiedScene = useMemo(() => {
    const layoutInput = {
      participants: [
        ...onStageParticipants.map((p) => ({ id: p.id, isScreen: false })),
        ...(screenStream ? [{ id: 'screen', isScreen: true }] : []),
      ],
      screenShareId: screenStream ? 'screen' : undefined,
      mode: (layoutState?.preset_name as any) || 'grid',
      viewPrefs: viewPreferences,
    };

    const scene = calculateLayout(layoutInput, {
      width: 1920,
      height: 1080,
      gap: 16,
      margin: 16,
    });

    // Add overlays for recording engine
    if (activeBrand.config.logoUrl) {
      scene.overlays.push({
        id: 'brand-logo',
        sourceId: 'logo',
        type: 'image',
        x: activeBrand.config.position?.x ?? 90,
        y: activeBrand.config.position?.y ?? 10,
        width: 10,
        height: 10,
        zIndex: 100,
      });
    }

    return scene;
  }, [onStageParticipants, screenStream, layoutState, viewPreferences, activeBrand]);

  // Pan/Crop handlers
  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (layoutLocked) return;
      draggingCropId.current = id;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [layoutLocked]
  );

  const handleCropMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingCropId.current || layoutLocked) return;

      const id = draggingCropId.current;
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      const current = viewPreferences[id] || {
        fit: 'contain',
        pan: { x: 50, y: 50 },
        zoom: 1,
      };
      const sensitivity = 0.2 / current.zoom;

      setViewPreference(id, {
        pan: {
          x: Math.max(0, Math.min(100, current.pan.x - deltaX * sensitivity)),
          y: Math.max(0, Math.min(100, current.pan.y - deltaY * sensitivity)),
        },
      });
    },
    [layoutLocked, viewPreferences, setViewPreference]
  );

  const handleCropMouseUp = useCallback(() => {
    draggingCropId.current = null;
  }, []);

  const handleZoom = useCallback(
    (id: string, delta: number) => {
      const current = viewPreferences[id] || {
        fit: 'contain',
        pan: { x: 50, y: 50 },
        zoom: 1,
      };
      setViewPreference(id, {
        zoom: Math.max(1, Math.min(3, current.zoom + delta)),
      });
    },
    [viewPreferences, setViewPreference]
  );

  const handleBannerPositionChange = useCallback(
    (bannerId: string, x: number, y: number) => {
      updateBanner(bannerId, { position: { x, y } });
    },
    [updateBanner]
  );

  const handleLogoPositionChange = useCallback(
    (x: number, y: number) => {
      updateBrand(activeBrand.id, { position: { x, y } });
    },
    [updateBrand, activeBrand.id]
  );

  return (
    <div
      ref={stageRef}
      className="w-full max-w-5xl aspect-video rounded-lg shadow-2xl relative overflow-hidden group border border-app-border transition-colors duration-500"
      style={{ backgroundColor: stageBackground }}
      onMouseUp={handleCropMouseUp}
    >
      {/* Empty state */}
      {unifiedScene.items.length === 0 && (
        <div className="absolute inset-0 text-white/30 flex flex-col items-center justify-center">
          <Monitor className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">Add to stage</p>
        </div>
      )}

      {/* Render participants */}
      {unifiedScene.items.map((item) => {
        const p =
          onStageParticipants.find((x) => x.id === item.id) ||
          (item.id === 'screen'
            ? ({
                id: 'screen',
                display_name: 'Presentation',
                media_state: { audio_enabled: false, video_enabled: true },
              } as Participant)
            : null);

        if (!p) return null;

        const stream =
          item.id === 'local'
            ? processedStream || localStream
            : item.id === 'screen'
            ? screenStream
            : remoteStreams[item.id];

        const isLocal = item.id === 'local';
        const isScreen = item.id === 'screen';
        const isCover = item.fit === 'cover';

        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${item.x}%`,
          top: `${item.y}%`,
          width: `${item.width}%`,
          height: `${item.height}%`,
          zIndex: item.zIndex,
          borderRadius: item.borderRadius ? `${item.borderRadius}px` : undefined,
          border: item.border
            ? `${item.border.width}px solid ${item.border.color}`
            : undefined,
        };

        return (
          <div
            key={item.id}
            style={style}
            className={`bg-black overflow-hidden shadow-sm transition-all ${
              !layoutLocked ? 'hover:ring-2 hover:ring-white/20' : ''
            } ${isCover && !layoutLocked ? 'cursor-move' : ''}`}
            onContextMenu={(e) => onContextMenu(e, item.id)}
            onMouseDown={
              isCover && !layoutLocked
                ? (e) => handleCropMouseDown(e, item.id)
                : undefined
            }
            onMouseMove={!layoutLocked ? handleCropMouseMove : undefined}
          >
            <VideoFeed
              participant={p}
              stream={stream}
              isLocal={isLocal && !isScreen}
              objectFit={item.fit}
              objectPosition={`${item.panX}% ${item.panY}%`}
              zoom={item.zoom}
            />

            {/* Name Label */}
            {activeBrand.config.showDisplayNames && (
              <div
                className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded font-bold text-xs backdrop-blur-sm text-white"
                style={{ backgroundColor: activeBrand.config.color }}
              >
                {p.display_name}
                {isScreen && (
                  <span className="opacity-75 ml-1 font-normal">
                    (Presentation)
                  </span>
                )}
              </div>
            )}

            {/* Mute indicator */}
            {!p.media_state.audio_enabled && !isScreen && (
              <div className="absolute top-3 right-3 z-30 bg-red-600 text-white p-1.5 rounded-full shadow-md animate-pulse">
                <MicOff className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Zoom controls */}
            {isCover && !layoutLocked && (
              <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-2 items-end opacity-0 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-lg p-1 border border-white/10">
                  <button
                    className="p-1 hover:bg-white/20 rounded text-white disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoom(item.id, -0.1);
                    }}
                    disabled={(item.zoom || 1) <= 1}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] font-mono text-white min-w-[30px] text-center">
                    {Math.round((item.zoom || 1) * 100)}%
                  </span>
                  <button
                    className="p-1 hover:bg-white/20 rounded text-white disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoom(item.id, 0.1);
                    }}
                    disabled={(item.zoom || 1) >= 3}
                  >
                    <PlusIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Banners */}
      {visibleBanners.map((b, idx) => {
        const isTicker = b.type === 'ticker' || b.isTicker;
        const bgOpacity = (b.backgroundOpacity ?? 100) / 100;
        const bgColor = b.backgroundColor || b.customColor || activeBrand.config.color;
        
        return (
          <DraggableOverlay
            key={b.id}
            isDraggable={!b.locked}
            locked={layoutLocked}
            containerRef={stageRef}
            initialX={b.fullWidth ? 50 : (b.position?.x ?? 50)}
            initialY={b.position?.y ?? (isTicker ? 90 : 80 - idx * 15)}
            onPositionChange={(x: number, y: number) => handleBannerPositionChange(b.id, x, y)}
            stackIndex={idx}
            verticalOnly={b.verticalOnly}
            fullWidth={b.fullWidth}
            minY={b.minY}
            maxY={b.maxY}
          >
            {isTicker ? (
              <div 
                className="overflow-hidden pointer-events-auto"
                style={{ 
                  backgroundColor: bgOpacity < 1 
                    ? `rgba(${parseInt(bgColor.slice(1,3),16)}, ${parseInt(bgColor.slice(3,5),16)}, ${parseInt(bgColor.slice(5,7),16)}, ${bgOpacity})`
                    : bgColor,
                  color: b.textColor || b.customTextColor || '#ffffff',
                }}
              >
                <div 
                  className="whitespace-nowrap py-2 px-4 font-bold text-base animate-ticker"
                  style={{
                    animationDuration: b.tickerSpeed === 'slow' ? '20s' : b.tickerSpeed === 'fast' ? '8s' : '12s',
                  }}
                >
                  {b.text} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {b.text} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {b.text}
                </div>
              </div>
            ) : (
              <div
                className="px-6 py-3 shadow-xl rounded-lg font-bold text-lg pointer-events-auto"
                style={{
                  backgroundColor: bgOpacity < 1 
                    ? `rgba(${parseInt(bgColor.slice(1,3),16)}, ${parseInt(bgColor.slice(3,5),16)}, ${parseInt(bgColor.slice(5,7),16)}, ${bgOpacity})`
                    : bgColor,
                  color: b.textColor || b.customTextColor || '#ffffff',
                }}
              >
                {b.text}
              </div>
            )}
          </DraggableOverlay>
        );
      })}

      {/* Brand Logo */}
      {activeBrand.config.logoUrl && (
        <DraggableOverlay
          isDraggable={!activeBrand.config.logoLocked}
          locked={layoutLocked}
          containerRef={stageRef}
          initialX={activeBrand.config.position?.x ?? 90}
          initialY={activeBrand.config.position?.y ?? 10}
          onPositionChange={handleLogoPositionChange}
          stackIndex={50}
          className="pointer-events-auto"
        >
          <img
            src={activeBrand.config.logoUrl}
            alt="Logo"
            className="h-12 w-auto object-contain drop-shadow-md select-none"
            draggable={false}
          />
        </DraggableOverlay>
      )}
    </div>
  );
}
