'use client';


import { useEffect, useState } from 'react';
import { MixerEngine } from '@/lib/engines/MixerEngine';
import { BroadcastEngine } from '@/lib/engines/BroadcastEngine';
import { PerformanceMonitor } from '@/lib/engines/PerformanceMonitor';
import { RecordingEngine } from '@/lib/engines/RecordingEngine';

interface StudioEngines {
    mixer: MixerEngine | null;
    broadcast: BroadcastEngine | null;
    performance: PerformanceMonitor | null;
    recording: RecordingEngine | null;
}

export function useStudioEngines() {
    const [engines, setEngines] = useState<StudioEngines>({
        mixer: null,
        broadcast: null,
        performance: null,
        recording: null
    });

    useEffect(() => {
        // 1. Initialize Engines
        console.log('[StudioEngines] Initializing S2 Systems...');
        
        const mixer = new MixerEngine();
        const broadcast = new BroadcastEngine(1920, 1080);
        const performance = new PerformanceMonitor();
        const recording = new RecordingEngine();

        // 2. Start Loops
        broadcast.startRendering();
        performance.start();

        // 3. Connect Performance Monitor to Adaptive Quality (Placeholder)
        performance.onMetrics((metrics) => {
            if (metrics.cpuLoad > 0.8) {
                // console.warn('[StudioEngines] High CPU Load - Throttling');
                // Future: broadcast.setQuality('low');
            }
        });

        // 4. Update State to expose engines to UI
        setEngines({ mixer, broadcast, performance, recording });

        return () => {
            console.log('[StudioEngines] Shutting down...');
            broadcast.stopRendering();
            performance.stop();
            // Mixer cleanup handled by AudioContext close if implemented, or GC
        };
    }, []);

    return engines;
}
