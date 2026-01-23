import { useState, useEffect, useRef, useCallback } from 'react';
import { VisualConfigType } from '@/types';
import { VideoProcessor } from '@/utils/VideoProcessor';

export function useMeetingMedia(
    localStream: MediaStream | null,
    audioEnabled: boolean,
    initialVisualConfig: VisualConfigType,
    replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>
) {
    const [visualConfig, setVisualConfig] = useState<VisualConfigType>(initialVisualConfig);
    const [processedLocalStream, setProcessedLocalStream] = useState<MediaStream | null>(null);
    const processorRef = useRef<VideoProcessor | null>(null);

    // Audio Analysis
    const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});
    const audioLevelsRef = useRef<Record<string, number>>({});
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Initial Processor Setup
    useEffect(() => {
        const processor = new VideoProcessor();
        processor.init().then(() => { processorRef.current = processor; });
        return () => { processor.stop(); };
    }, []);

    // Sync Visual Config to Processor
    useEffect(() => {
        if (processorRef.current) {
            processorRef.current.setVisualConfig(visualConfig);
        }
    }, [visualConfig]);

    // Apply Effects
    useEffect(() => {
        const applyEffects = async () => {
            if (!processorRef.current || !localStream) {
                if (!localStream) {
                    setProcessedLocalStream(null);
                }
                return;
            }

            if (visualConfig.backgroundType !== 'none') {
                const processed = await processorRef.current.start(localStream);
                setProcessedLocalStream(processed);
                const processedTrack = processed.getVideoTracks()[0];
                if (processedTrack) replaceVideoTrack(processedTrack);
            } else {
                processorRef.current.stopProcessing();
                setProcessedLocalStream(null);
                const originalTrack = localStream.getVideoTracks()[0];
                if (originalTrack) replaceVideoTrack(originalTrack);
            }
        };
        applyEffects();
    }, [visualConfig.backgroundType, localStream, replaceVideoTrack]);

    // Audio Analysis Loop
    useEffect(() => {
        if (localStream && audioEnabled) {
            try {
                if (!audioContextRef.current) {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    audioContextRef.current = new AudioContextClass();
                }
                const ctx = audioContextRef.current;
                if (sourceRef.current) sourceRef.current.disconnect();
                if (analyserRef.current) analyserRef.current.disconnect();

                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                const source = ctx.createMediaStreamSource(localStream);
                source.connect(analyser);
                sourceRef.current = source;
                analyserRef.current = analyser;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const updateLocalVolume = () => {
                    if (!analyserRef.current) return;
                    analyserRef.current.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                    const average = sum / dataArray.length;
                    audioLevelsRef.current['local'] = Math.min(1, average / 50);
                    animationFrameRef.current = requestAnimationFrame(updateLocalVolume);
                };
                updateLocalVolume();
            } catch (e) {
                console.error("Audio analysis failed", e);
            }
        } else {
            audioLevelsRef.current['local'] = 0;
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }

        const interval = setInterval(() => {
            setAudioLevels(prev => {
                let hasChanged = false;
                const next = { ...prev };
                for (const [id, val] of Object.entries(audioLevelsRef.current)) {
                    if (!prev[id] || Math.abs(prev[id] - val) > 0.05) {
                        next[id] = val;
                        hasChanged = true;
                    }
                }
                return hasChanged ? next : prev;
            });
        }, 250);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            clearInterval(interval);
        };
    }, [localStream, audioEnabled]);

    return {
        visualConfig, setVisualConfig,
        processedLocalStream,
        audioLevels,
        processorRef
    };
}
