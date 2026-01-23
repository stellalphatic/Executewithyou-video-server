'use client';


import { useState, useCallback, useEffect } from 'react';
import { UploadItem } from '@/types';

export function useUploadQueue() {
    const [queue, setQueue] = useState<UploadItem[]>([]);

    const addUpload = useCallback((blob: Blob, meta: { id: string, filename: string, mimeType: string }) => {
        const newItem: UploadItem = {
            id: `up-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file: blob,
            filename: meta.filename,
            mimeType: meta.mimeType,
            progress: 0,
            status: 'pending',
            timestamp: Date.now()
        };
        setQueue(prev => [newItem, ...prev]);
    }, []);

    const processUpload = useCallback(async (item: UploadItem) => {
        try {
            // Update status to uploading
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));

            // SIMULATION: S3 Signed URL Upload
            // In production: fetch('/api/upload/sign') -> PUT to S3
            
            const totalSteps = 20;
            for (let i = 0; i <= totalSteps; i++) {
                await new Promise(resolve => setTimeout(resolve, 200)); // Simulate net lag
                const progress = Math.round((i / totalSteps) * 100);
                setQueue(prev => prev.map(up => up.id === item.id ? { ...up, progress } : up));
            }

            // Success
            setQueue(prev => prev.map(i => i.id === item.id ? { 
                ...i, 
                status: 'completed', 
                progress: 100, 
                url: `https://storage.allstrm.com/${i.filename}` 
            } : i));

        } catch (error) {
            console.error("Upload failed", error);
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Upload Failed' } : i));
        }
    }, []);

    // Queue Processor Effect
    useEffect(() => {
        const pending = queue.find(i => i.status === 'pending');
        if (pending) {
            processUpload(pending);
        }
    }, [queue, processUpload]);

    const removeUpload = useCallback((id: string) => {
        setQueue(prev => prev.filter(i => i.id !== id));
    }, []);

    const retryUpload = useCallback((id: string) => {
        setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'pending', progress: 0, error: undefined } : i));
    }, []);

    return {
        queue,
        addUpload,
        removeUpload,
        retryUpload
    };
}
