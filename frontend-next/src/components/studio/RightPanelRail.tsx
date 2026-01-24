'use client';

/**
 * RightPanelRail Component - Vertical tab rail for right panel
 */

import React from 'react';
import {
  Palette,
  Layers,
  UserCheck,
  FileVideo,
  Sliders,
  Users,
} from 'lucide-react';
import { useStudioStore, RightPanelTab } from '@/stores/studioStore';

interface RailTabProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function RailTab({ icon, label, active, onClick }: RailTabProps) {
  return (
    <button
      onClick={onClick}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group ${
        active
          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
          : 'text-content-medium hover:text-content-high hover:bg-app-bg'
      }`}
    >
      {React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement<any>, { size: 20 })
        : icon}
      <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg mr-2">
        {label}
      </div>
    </button>
  );
}

const TABS: { id: RightPanelTab; icon: React.ReactNode; label: string }[] = [
  { id: 'brand', icon: <Palette />, label: 'Brand' },
  { id: 'banners', icon: <Layers />, label: 'Banners' },
  { id: 'backstage', icon: <UserCheck />, label: 'Green Room' },
  { id: 'recording', icon: <FileVideo />, label: 'Recording' },
  { id: 'mixer', icon: <Sliders />, label: 'Mixer' },
  { id: 'private_chat', icon: <Users />, label: 'Private' },
];

export function RightPanelRail() {
  const activeTab = useStudioStore((s) => s.activeRightTab);
  const setActiveTab = useStudioStore((s) => s.setActiveRightTab);

  return (
    <div className="w-16 bg-app-surface border-l border-app-border flex flex-col items-center py-4 z-20 gap-4 shrink-0">
      {TABS.map((tab) => (
        <RailTab
          key={tab.id}
          icon={tab.icon}
          label={tab.label}
          active={activeTab === tab.id}
          onClick={() => setActiveTab(tab.id)}
        />
      ))}
    </div>
  );
}
