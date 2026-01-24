'use client';

/**
 * ScenesSidebar Component - Left sidebar with scenes/run of show
 * Includes tier-enforced scene management
 */

import React, { useState } from 'react';
import { RefreshCw, Film, Plus, Trash2, Edit2, Crown, X, Check } from 'lucide-react';
import { useStudioStore, selectActiveScene } from '@/stores/studioStore';
import { Tier } from '@/types';
import { getTierLimits, TIER_DISPLAY, validateTierAction } from '@/lib/tierConfig';

interface SceneCardProps {
  title: string;
  type: 'layout' | 'video';
  isActive: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
  participants?: string[];
  canDelete?: boolean;
}

function SceneCard({
  title,
  type,
  isActive,
  onClick,
  onDelete,
  onRename,
  participants = [],
  canDelete = true,
}: SceneCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(title);

  const handleRename = () => {
    if (editName.trim() && editName !== title && onRename) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setEditName(title);
      setIsEditing(false);
    }
  };

  return (
    <div
      onClick={!isEditing ? onClick : undefined}
      className={`group flex items-center gap-3 p-3 rounded-lg border-l-2 cursor-pointer transition-all ${
        isActive
          ? 'bg-indigo-500/10 border-indigo-500'
          : 'bg-app-bg/50 border-transparent hover:bg-app-bg hover:border-content-low'
      }`}
    >
      <div className="w-12 h-8 bg-black/40 rounded flex items-center justify-center text-content-low overflow-hidden relative flex-shrink-0">
        {type === 'video' ? (
          <Film className="w-4 h-4 opacity-50" />
        ) : (
          <div className="grid grid-cols-2 gap-0.5 p-0.5 w-full h-full">
            {participants.length > 0 ? (
              participants
                .slice(0, 4)
                .map((_, i) => (
                  <div key={i} className="bg-indigo-500/40 rounded-[1px]" />
                ))
            ) : (
              <div className="bg-content-low/20 col-span-2 row-span-2" />
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              autoFocus
              className="text-xs font-bold bg-app-bg border border-app-border rounded px-1 py-0.5 w-full focus:outline-none focus:border-indigo-500"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRename();
              }}
              className="p-0.5 hover:bg-green-500/20 rounded text-green-500"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditName(title);
                setIsEditing(false);
              }}
              className="p-0.5 hover:bg-red-500/20 rounded text-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div
            className={`text-xs font-bold truncate ${
              isActive ? 'text-indigo-400' : 'text-content-medium'
            }`}
          >
            {title}
          </div>
        )}
        <div className="text-[9px] text-content-low uppercase tracking-wider">
          {participants.length} Sources
        </div>
      </div>
      
      {/* Action buttons - show on hover */}
      {!isEditing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditName(title);
                setIsEditing(true);
              }}
              className="p-1 hover:bg-app-bg rounded text-content-low hover:text-content-medium"
              title="Rename scene"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 hover:bg-red-500/20 rounded text-content-low hover:text-red-400"
              title="Delete scene"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ScenesSidebar() {
  const scenes = useStudioStore((s) => s.scenes);
  const activeSceneId = useStudioStore((s) => s.activeSceneId);
  const tier = useStudioStore((s) => s.tier);
  const loadScene = useStudioStore((s) => s.loadScene);
  const addScene = useStudioStore((s) => s.addScene);
  const removeScene = useStudioStore((s) => s.removeScene);
  const updateScene = useStudioStore((s) => s.updateScene);
  const resetLayout = useStudioStore((s) => s.resetLayout);

  const limits = getTierLimits(tier);
  const canAddScene = limits.scenesEnabled && (limits.maxScenes === -1 || scenes.length < limits.maxScenes);
  const validation = validateTierAction(tier, 'ADD_SCENE', { currentCount: scenes.length });

  const handleAddScene = () => {
    if (!canAddScene) return;
    addScene();
  };

  const handleDeleteScene = (sceneId: string) => {
    // Don't allow deleting the last scene
    if (scenes.length <= 1) return;
    removeScene(sceneId);
  };

  const handleRenameScene = (sceneId: string, newName: string) => {
    updateScene(sceneId, { name: newName });
  };

  return (
    <div className="w-64 bg-app-surface/30 backdrop-blur-md border-r border-app-border flex flex-col z-20 shadow-sm relative">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          <div className="p-2 flex items-center justify-between sticky top-0 bg-app-surface/90 backdrop-blur z-10">
            <span className="text-[10px] font-bold text-content-low uppercase tracking-widest">
              Run of Show
            </span>
            <span className="text-[9px] text-content-low">
              {scenes.length}{limits.maxScenes !== -1 ? `/${limits.maxScenes}` : ''} scenes
            </span>
          </div>
          
          {/* Scenes list */}
          <div className="space-y-2">
            {scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                title={scene.name}
                type="layout"
                isActive={activeSceneId === scene.id}
                onClick={() => loadScene(scene)}
                onDelete={() => handleDeleteScene(scene.id)}
                onRename={(newName) => handleRenameScene(scene.id, newName)}
                participants={scene.participants}
                canDelete={scenes.length > 1}
              />
            ))}
          </div>
          
          {/* Add Scene button */}
          {limits.scenesEnabled ? (
            <button
              onClick={handleAddScene}
              disabled={!canAddScene}
              className={`w-full py-2 border border-dashed rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                canAddScene
                  ? 'border-content-low text-content-medium hover:border-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/5'
                  : 'border-content-low/50 text-content-low cursor-not-allowed'
              }`}
              title={!canAddScene ? validation.reason : 'Add new scene'}
            >
              <Plus className="w-3 h-3" />
              ADD SCENE
              {!canAddScene && validation.upgrade && (
                <Crown className="w-3 h-3 text-amber-500" />
              )}
            </button>
          ) : (
            <div className="w-full py-3 border border-dashed border-amber-500/30 rounded-lg bg-amber-500/5 text-center">
              <div className="flex items-center justify-center gap-2 text-amber-500">
                <Crown className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Scenes Locked
                </span>
              </div>
              <p className="text-[9px] text-content-low mt-1">
                Upgrade to {TIER_DISPLAY[Tier.CREATOR].name} to create multiple scenes
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-app-border bg-app-surface/50 space-y-2">
        {/* Tier info */}
        {tier < Tier.ENTERPRISE && limits.maxScenes !== -1 && (
          <div className="text-[9px] text-content-low flex items-center justify-center gap-1">
            <Crown className="w-3 h-3 text-amber-500/70" />
            <span>
              Upgrade for {limits.maxScenes < 20 ? 'more' : 'unlimited'} scenes
            </span>
          </div>
        )}
        
        <button 
          onClick={resetLayout}
          className="w-full py-2 bg-app-bg border border-app-border rounded text-[10px] font-bold text-content-medium hover:text-content-high hover:border-content-medium transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-3 h-3" />
          RESET LAYOUT
        </button>
      </div>
    </div>
  );
}
