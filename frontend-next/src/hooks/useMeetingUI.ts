import { useState, useCallback, useRef } from 'react';
import { MeetingLayout } from '@/types';

export type ActiveMenu = 'chat' | 'participants' | 'share' | 'record' | 'reactions' | 'more' | 'settings' | null;

export interface ViewPreference {
    fit: 'contain' | 'cover';
    pan: { x: number; y: number };
    zoom: number;
}

export function useMeetingUI() {
    const [activeMenu, _setActiveMenu] = useState<ActiveMenu>(null);
    const setActiveMenu = useCallback((menu: ActiveMenu | ((prev: ActiveMenu) => ActiveMenu)) => {
        _setActiveMenu((prev: ActiveMenu) => {
            const next = typeof menu === 'function' ? menu(prev) : menu;
            if (prev === next) return prev;
            console.log(`%c[MeetingUI] activeMenu: ${prev} => ${next}`, 'color: #3b82f6');
            return next;
        });
    }, []);

    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'general' | 'effects'>('general');
    const [showEndConfirmation, setShowEndConfirmation] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    const [layout, setLayout] = useState<MeetingLayout>('gallery');
    const [pinnedId, setPinnedId] = useState<string | null>(null);

    const [viewPrefs, setViewPrefs] = useState<Record<string, ViewPreference>>({});
    const [isLayoutLocked, setIsLayoutLocked] = useState(false);

    const [bottomBarDocked, setBottomBarDocked] = useState(true);
    const [bottomBarVisible, setBottomBarVisible] = useState(true);

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, itemId: string, participantId: string } | null>(null);

    const toggleMenu = useCallback((menu: ActiveMenu) => {
        setActiveMenu(prev => prev === menu ? null : menu);
    }, [setActiveMenu]);

    const handleCopyLink = useCallback((roomId: string) => {
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/join/${roomId}`;
        navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    }, []);

    return {
        activeMenu, setActiveMenu, toggleMenu,
        showSettings, setShowSettings,
        settingsTab, setSettingsTab,
        showEndConfirmation, setShowEndConfirmation,
        copiedLink, handleCopyLink,
        layout, setLayout,
        pinnedId, setPinnedId,
        viewPrefs, setViewPrefs,
        isLayoutLocked, setIsLayoutLocked,
        bottomBarDocked, setBottomBarDocked,
        bottomBarVisible, setBottomBarVisible,
        contextMenu, setContextMenu
    };
}
