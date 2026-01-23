'use client';


import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Participant, MeetingLayout } from '@/types';
import { ParticipantTile } from './ParticipantTile';

interface WebGLGalleryProps {
    participants: Participant[];
    remoteStreams: Record<string, MediaStream>;
    localStream: MediaStream | null;
    screenStream?: MediaStream | null;
    layout?: MeetingLayout;
    pinnedId?: string | null;
    onPin: (id: string) => void;
    onContextMenu?: (e: React.MouseEvent, itemId: string, participantId: string) => void;
    viewPrefs?: Record<string, { fit: 'contain' | 'cover', pan: { x: number; y: number }, zoom: number }>;
    onCropMouseDown?: (e: React.MouseEvent, id: string) => void;
    onZoom?: (id: string, delta: number) => void;
    audioLevels?: Record<string, number>;
    isLayoutLocked?: boolean;
}

export const WebGLGallery: React.FC<WebGLGalleryProps> = ({
    participants,
    remoteStreams,
    localStream,
    screenStream,
    layout = 'gallery',
    pinnedId,
    onPin,
    onContextMenu,
    viewPrefs,
    onCropMouseDown,
    onZoom,
    audioLevels,
    isLayoutLocked = false
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [layoutClass, setLayoutClass] = useState('grid-cols-1');
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    // Store custom order of Item IDs
    const [customOrder, setCustomOrder] = useState<string[]>([]);

    // 1. Construct raw render items
    const rawItems = useMemo(() => {
        const items: any[] = [];

        // Local Participant Object
        const localParticipant = {
            id: 'local',
            display_name: 'You',
            room_id: 'local-room',
            role: 'host',
            ingest_type: 'webrtc',
            is_on_stage: true,
            media_state: {
                audio_enabled: true,
                video_enabled: true,
                screen_sharing: !!screenStream,
                connection_quality: 'excellent'
            }
        } as Participant;

        // Screen Share
        if (screenStream) {
            items.push({
                id: 'local-screen',
                participantId: 'local',
                display_name: 'Your Screen',
                stream: screenStream,
                isScreen: true,
                isLocal: true,
                participant: localParticipant
            });
        }

        // Local User
        items.push({
            id: 'local',
            participantId: 'local',
            display_name: 'You',
            stream: localStream,
            isScreen: false,
            isLocal: true,
            participant: localParticipant
        });

        // Remote Participants
        participants.forEach(p => {
            items.push({
                id: p.id,
                participantId: p.id,
                display_name: p.display_name,
                stream: remoteStreams[p.id],
                isScreen: false,
                isLocal: false,
                participant: p
            });
        });

        return items;
    }, [participants, localStream, screenStream, remoteStreams]);

    // 2. Sync Custom Order with Available Items
    useEffect(() => {
        console.log("// 2. Sync Custom Order with Available Items");
        setCustomOrder(prevOrder => {
            const currentIds = rawItems.map(i => i.id);
            // Keep existing order for present items
            const newOrder = prevOrder.filter(id => currentIds.includes(id));
            // Append new items
            currentIds.forEach(id => {
                if (!newOrder.includes(id)) {
                    newOrder.push(id);
                }
            });
            return newOrder;
        });
    }, [rawItems]);

    // 3. Sort Items based on Custom Order
    const sortedItems = useMemo(() => {
        if (customOrder.length === 0) return rawItems;
        return [...rawItems].sort((a, b) => {
            const indexA = customOrder.indexOf(a.id);
            const indexB = customOrder.indexOf(b.id);
            return (indexA === -1 ? 9999 : indexA) - (indexB === -1 ? 9999 : indexB);
        });
    }, [rawItems, customOrder]);

    // Determine Main Item logic
    let mainItem = sortedItems[0];
    if (pinnedId) {
        const pinned = sortedItems.find(i => i.id === pinnedId || i.participantId === pinnedId);
        if (pinned) mainItem = pinned;
    } else if (screenStream) {
        const screen = sortedItems.find(i => i.isScreen);
        if (screen) mainItem = screen;
    } else {
        // Fallback to first remote if no screen share, else local
        const remote = sortedItems.find(i => !i.isLocal);
        if (remote && sortedItems.indexOf(remote) === 0) mainItem = remote;
    }

    const stripItems = sortedItems.filter(i => i.id !== mainItem.id);

    // Responsive Grid Calculation
    useEffect(() => {
        const count = sortedItems.length;
        if (count === 1) setLayoutClass('grid-cols-1');
        else if (count === 2) setLayoutClass('grid-cols-2');
        else if (count <= 4) setLayoutClass('grid-cols-2 md:grid-cols-2');
        else if (count <= 9) setLayoutClass('grid-cols-2 md:grid-cols-3');
        else if (count <= 16) setLayoutClass('grid-cols-3 md:grid-cols-4');
        else if (count <= 25) setLayoutClass('grid-cols-4 md:grid-cols-5');
        else setLayoutClass('grid-cols-4 md:grid-cols-7');
    }, [sortedItems.length]);

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (isLayoutLocked) return;
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (isLayoutLocked) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        if (isLayoutLocked || draggedIndex === null || draggedIndex === dropIndex) return;

        const newOrder = [...customOrder];
        // Map visual index back to ID using sortedItems
        const draggedId = sortedItems[draggedIndex].id;
        const dropId = sortedItems[dropIndex].id;

        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(dropId);

        if (fromIdx !== -1 && toIdx !== -1) {
            newOrder.splice(fromIdx, 1);
            newOrder.splice(toIdx, 0, draggedId);
            setCustomOrder(newOrder);
        }
        setDraggedIndex(null);
    };

    const activeLayout = pinnedId ? 'speaker' : layout;

    if (activeLayout === 'speaker') {
        const mainPref = viewPrefs?.[mainItem.participantId] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 };
        const mainAudio = audioLevels?.[mainItem.participantId] || 0;

        return (
            <div className="w-full h-full p-2 bg-[#121212] flex gap-2">
                <div className="flex-1 h-full">
                    <ParticipantTile
                        item={mainItem}
                        isPinned={pinnedId === mainItem.id}
                        onPin={onPin}
                        onContextMenu={onContextMenu}
                        className="w-full h-full"
                        objectFit={mainPref.fit}
                        objectPosition={`${mainPref.pan.x}% ${mainPref.pan.y}%`}
                        zoom={mainPref.zoom}
                        audioLevel={mainAudio}
                        onCropMouseDown={onCropMouseDown}
                        onZoom={onZoom}
                    />
                </div>
                <div className="w-64 h-full flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                    {stripItems.map(item => {
                        const pref = viewPrefs?.[item.participantId] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 };
                        const audio = audioLevels?.[item.participantId] || 0;

                        return (
                            <div key={item.id} className="aspect-video shrink-0">
                                <ParticipantTile
                                    item={item}
                                    isPinned={false}
                                    onPin={onPin}
                                    onContextMenu={onContextMenu}
                                    className="w-full h-full"
                                    objectFit={pref.fit}
                                    objectPosition={`${pref.pan.x}% ${pref.pan.y}%`}
                                    zoom={pref.zoom}
                                    audioLevel={audio}
                                    onCropMouseDown={onCropMouseDown}
                                    onZoom={onZoom}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Default Gallery with Drag and Drop
    return (
        <div ref={containerRef} className="w-full h-full p-2 bg-[#121212] overflow-y-auto custom-scrollbar">
            <div className={`grid gap-2 w-full h-full content-center ${layoutClass} auto-rows-fr aspect-video`}>
                {sortedItems.map((item, idx) => {
                    const pref = viewPrefs?.[item.participantId] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 };
                    const audio = audioLevels?.[item.participantId] || 0;

                    return (
                        <ParticipantTile
                            key={item.id}
                            item={item}
                            isPinned={pinnedId === item.id}
                            onPin={onPin}
                            onContextMenu={onContextMenu}
                            objectFit={pref.fit}
                            objectPosition={`${pref.pan.x}% ${pref.pan.y}%`}
                            zoom={pref.zoom}
                            audioLevel={audio}
                            onCropMouseDown={onCropMouseDown}
                            onZoom={onZoom}
                            draggable={!isLayoutLocked}
                            onDragStart={(e) => handleDragStart(e, idx)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, idx)}
                        />
                    );
                })}
            </div>
        </div>
    );
};
