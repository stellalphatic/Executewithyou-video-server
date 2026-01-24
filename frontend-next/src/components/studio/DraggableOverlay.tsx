'use client';

/**
 * DraggableOverlay Component - Enables drag positioning for overlays
 * 
 * Features:
 * - Full X/Y dragging for standard overlays
 * - Vertical-only dragging for tickers (verticalOnly prop)
 * - Min/Max Y constraints
 * - Full width mode
 */

import React, { useState, useRef, useCallback, useEffect, RefObject } from 'react';

interface DraggableOverlayProps {
  children: React.ReactNode;
  isDraggable: boolean;
  locked: boolean;
  initialX?: number;
  initialY?: number;
  onPositionChange?: (x: number, y: number) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  className?: string;
  style?: React.CSSProperties;
  stackIndex?: number;
  // New props for ticker support
  verticalOnly?: boolean;      // Restrict to vertical dragging only
  fullWidth?: boolean;         // Take full width of container
  minY?: number;               // Minimum Y position (percentage)
  maxY?: number;               // Maximum Y position (percentage)
}

export function DraggableOverlay({
  children,
  isDraggable,
  locked,
  initialX = 50,
  initialY = 50,
  onPositionChange,
  containerRef,
  className = '',
  style = {},
  stackIndex = 0,
  verticalOnly = false,
  fullWidth = false,
  minY,
  maxY,
}: DraggableOverlayProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);

  // Sync position when initial values change (and not dragging)
  useEffect(() => {
    if (!isDragging) {
      setPos({ x: initialX, y: initialY });
    }
  }, [initialX, initialY, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggable || locked) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    [isDraggable, locked]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;

      const container =
        containerRef?.current || (dragRef.current.offsetParent as HTMLElement);
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      let newX = verticalOnly 
        ? (fullWidth ? 50 : pos.x)  // Keep X fixed for vertical-only
        : ((e.clientX - containerRect.left) / containerRect.width) * 100;
      let newY =
        ((e.clientY - containerRect.top) / containerRect.height) * 100;

      const elemRect = dragRef.current.getBoundingClientRect();
      const elemWidthPct = (elemRect.width / containerRect.width) * 100;
      const elemHeightPct = (elemRect.height / containerRect.height) * 100;

      // X constraints (only apply if not verticalOnly)
      if (!verticalOnly) {
        const constraintMinX = elemWidthPct / 2;
        const constraintMaxX = 100 - elemWidthPct / 2;
        newX = Math.max(constraintMinX, Math.min(constraintMaxX, newX));
      }

      // Y constraints
      const constraintMinY = minY !== undefined ? minY : elemHeightPct / 2;
      const constraintMaxY = maxY !== undefined ? maxY : 100 - elemHeightPct / 2;
      newY = Math.max(constraintMinY, Math.min(constraintMaxY, newY));

      setPos({ x: newX, y: newY });
    },
    [isDragging, containerRef, verticalOnly, fullWidth, pos.x, minY, maxY]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onPositionChange?.(pos.x, pos.y);
    }
  }, [isDragging, pos, onPositionChange]);

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // For full-width tickers, override position styles
  const positionStyle: React.CSSProperties = fullWidth
    ? {
        left: 0,
        right: 0,
        top: `${pos.y}%`,
        transform: 'translateY(-50%)',
        width: '100%',
      }
    : {
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
      };

  return (
    <div
      ref={dragRef}
      onMouseDown={handleMouseDown}
      style={{
        ...style,
        ...positionStyle,
        position: 'absolute',
        cursor: isDraggable && !locked 
          ? (verticalOnly ? 'ns-resize' : 'move') 
          : 'default',
        zIndex: isDragging
          ? 1000
          : (Number(style?.zIndex ?? 50)) + Number(stackIndex),
        pointerEvents: locked ? 'none' : 'auto',
        transition: isDragging
          ? 'none'
          : 'top 0.1s linear, left 0.1s linear',
      }}
      className={`${className} ${
        isDragging ? 'ring-2 ring-indigo-500 shadow-xl' : ''
      } select-none`}
    >
      {children}
    </div>
  );
}
