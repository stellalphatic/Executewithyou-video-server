'use client';


import React, { useState, useRef, useEffect } from 'react';
import { 
    Mic, MicOff, Video, VideoOff, Settings, X, Upload, ImageIcon, 
    Sliders, Disc, Monitor, User, ArrowRight, Volume2, CheckCircle2 
} from 'lucide-react';
import { Button } from './Button';
import { VisualConfigType } from '@/types';
import { VideoProcessor } from '@/utils/VideoProcessor';

interface StudioSetupProps {
    onEnterStudio: (displayName: string, cam: boolean, mic: boolean, visualConfig: VisualConfigType) => void;
    defaultName: string;
    isMeeting?: boolean;
}

const SettingsToggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
    <div className="flex items-center justify-between cursor-pointer py-2" onClick={onChange}>
        <span className="text-sm font-medium text-content-high">{label}</span>
        <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-indigo-500' : 'bg-app-border'}`}>
            <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
    </div>
);

export const StudioSetup: React.FC<StudioSetupProps> = ({ onEnterStudio, defaultName, isMeeting }) => {
    const [displayName, setDisplayName] = useState(defaultName);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [activeTab, setActiveTab] = useState<'general' | 'visual_effects' | 'audio' | 'recording'>('general');
    
    // Preview Stream
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null); // Persist stream across renders
    const [volumeLevel, setVolumeLevel] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);

    // Visual Config
    const [visualConfig, setVisualConfig] = useState<VisualConfigType>({
        skinEnhance: false,
        greenScreen: false,
        backgroundType: 'none',
        backgroundImage: '',
        blurAmount: 50,
        brightness: 0,
        contrast: 1, 
        saturation: 1, 
        keyThreshold: 0.4,
        keySmoothness: 0.1
    });

    const [recordingConfig, setRecordingConfig] = useState({
        localRecording: false
    });

    const processorRef = useRef<VideoProcessor | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const customBackgrounds = [
        'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400', 
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400'
    ];

    // Initialize Video Processor ONCE
    useEffect(() => {
        const processor = new VideoProcessor();
        processor.init().then(() => { processorRef.current = processor; });
        return () => { 
            if (processorRef.current) {
                processorRef.current.stop(); 
                processorRef.current = null;
            }
        };
    }, []);

    // 1. Media Initialization
    useEffect(() => {
        let mounted = true;

        const initMedia = async () => {
            try {
                if (streamRef.current && streamRef.current.active) return;

                // Performance Optimization: Request explicit 60fps and HD resolution
                const localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 }, 
                        frameRate: { ideal: 60, min: 30 } 
                    }, 
                    audio: true 
                });
                
                if (!mounted) {
                    localStream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = localStream;
                
                // Audio Analysis Setup
                try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContextClass) {
                        const audioCtx = new AudioContextClass();
                        const analyser = audioCtx.createAnalyser();
                        const source = audioCtx.createMediaStreamSource(localStream);
                        source.connect(analyser);
                        analyser.fftSize = 256;
                        
                        audioContextRef.current = audioCtx;

                        const dataArray = new Uint8Array(analyser.frequencyBinCount);
                        let lastUpdate = 0;

                        const updateVolume = () => {
                            if (!mounted) return;
                            
                            // Performance Optimization: Throttle state updates to ~10fps
                            // Updating state on every frame (60fps) kills React performance
                            const now = performance.now();
                            if (now - lastUpdate > 100) { 
                                analyser.getByteFrequencyData(dataArray);
                                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                                setVolumeLevel(avg);
                                lastUpdate = now;
                            }
                            
                            rafRef.current = requestAnimationFrame(updateVolume);
                        };
                        updateVolume();
                    }
                } catch (err) {
                    console.warn("Audio Context init failed", err);
                }

                // Initial attachment
                if (videoRef.current) {
                    videoRef.current.srcObject = localStream;
                }

            } catch (e) {
                console.error("Camera access failed", e);
                setVideoEnabled(false);
            }
        };

        initMedia();
        
        return () => {
            mounted = false;
            // CRITICAL: Stop tracks to release hardware lock for next component
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []); 

    // 2. Handle Toggles
    useEffect(() => {
        if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach(t => t.enabled = audioEnabled);
            streamRef.current.getVideoTracks().forEach(t => t.enabled = videoEnabled);
        }
    }, [audioEnabled, videoEnabled]);

    // 3. Handle Visual Effects
    useEffect(() => {
        const updateEffects = async () => {
            const s = streamRef.current;
            if (!processorRef.current || !s || !s.active) return;
            
            processorRef.current.setVisualConfig(visualConfig);

            if (visualConfig.backgroundType !== 'none' && videoEnabled) {
                const processed = await processorRef.current.start(s);
                if (videoRef.current && videoRef.current.srcObject !== processed) {
                    videoRef.current.srcObject = processed;
                }
            } else {
                processorRef.current.stopProcessing(); 
                if (videoRef.current && videoRef.current.srcObject !== s) {
                    videoRef.current.srcObject = s;
                }
            }
        };
        updateEffects();
    }, [visualConfig, videoEnabled]);

    const handleEnter = () => {
        // Stop tracks completely so `useAllstrm` can acquire them fresh
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        
        if (processorRef.current) {
            processorRef.current.stop();
        }

        onEnterStudio(displayName, videoEnabled, audioEnabled, visualConfig);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    setVisualConfig(p => ({...p, backgroundType: 'image', backgroundImage: ev.target.result as string}));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="h-screen w-full bg-app-bg text-content-high flex items-center justify-center p-8 animate-fade-in">
            <div className="w-full max-w-5xl h-[600px] bg-app-bg border border-app-border rounded-2xl shadow-2xl flex overflow-hidden">
                
                {/* Left: Preview */}
                <div className="w-[60%] bg-black relative p-6 flex flex-col justify-between">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 z-10 pointer-events-none" />
                    
                    <div className="relative z-20 flex justify-between items-start">
                        <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-white/90">
                            {isMeeting ? 'Meeting Preview' : 'Studio Preview'}
                        </div>
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`w-full h-full ${videoEnabled ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
                             <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                        </div>
                        
                        {!videoEnabled && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/50">
                                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                    <VideoOff className="w-8 h-8" />
                                </div>
                                <span className="text-sm font-medium">Camera is off</span>
                            </div>
                        )}
                    </div>

                    <div className="relative z-20 flex items-center justify-center gap-4">
                        <button 
                            onClick={() => setAudioEnabled(!audioEnabled)}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${audioEnabled ? 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-md' : 'bg-red-500 text-white hover:bg-red-600'}`}
                        >
                            {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                        </button>
                        <button 
                            onClick={() => setVideoEnabled(!videoEnabled)}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${videoEnabled ? 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-md' : 'bg-red-500 text-white hover:bg-red-600'}`}
                        >
                            {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Right: Configuration */}
                <div className="w-[40%] bg-app-surface flex flex-col">
                    <div className="p-8 flex-1 overflow-y-auto">
                        <h2 className="text-2xl font-bold text-content-high mb-6">{isMeeting ? 'Join Meeting' : 'Get ready to stream'}</h2>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-content-medium uppercase tracking-wider">Display Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                                    <input 
                                        type="text" 
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        className="w-full bg-app-bg border border-app-border rounded-lg pl-10 pr-4 py-3 text-sm text-content-high focus:border-indigo-500 focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex border-b border-app-border">
                                {['general', 'visual_effects', 'audio', 'recording'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab as any)}
                                        className={`pb-2 px-1 text-xs font-medium mr-4 border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-content-medium hover:text-content-high'}`}
                                    >
                                        {tab.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[200px]">
                                {activeTab === 'general' && (
                                    <div className="space-y-4 animate-slide-up">
                                        <div className="p-4 rounded-lg bg-app-bg border border-app-border flex items-start gap-3">
                                            <Monitor className="w-5 h-5 text-indigo-500 mt-0.5" />
                                            <div>
                                                <div className="text-sm font-semibold text-content-high">System Check</div>
                                                <div className="text-xs text-content-medium mt-1">Camera and microphone permissions granted. Network connection is stable.</div>
                                            </div>
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'visual_effects' && (
                                    <div className="space-y-6 animate-slide-up">
                                        <div className="space-y-2">
                                            <SettingsToggle label="Enhance skin appearance" checked={visualConfig.skinEnhance} onChange={() => setVisualConfig(p => ({...p, skinEnhance: !p.skinEnhance}))} />
                                            <SettingsToggle label="I have a green screen" checked={visualConfig.greenScreen} onChange={() => setVisualConfig(p => ({...p, greenScreen: !p.greenScreen}))} />
                                        </div>
                                        <div className="pt-4 border-t border-app-border/50">
                                            <h3 className="text-xs font-bold text-content-medium uppercase tracking-wider mb-3">Backgrounds</h3>
                                            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
                                            <div className="grid grid-cols-4 gap-2">
                                                <button onClick={() => setVisualConfig(p => ({...p, backgroundType: 'none', backgroundImage: ''}))} className={`aspect-video rounded border ${visualConfig.backgroundType === 'none' ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border bg-app-bg'} flex flex-col items-center justify-center text-[10px]`}>
                                                    <X className="w-3 h-3 mb-1"/> None
                                                </button>
                                                <button onClick={() => setVisualConfig(p => ({...p, backgroundType: 'blur', backgroundImage: ''}))} className={`aspect-video rounded border ${visualConfig.backgroundType === 'blur' ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border bg-app-bg'} flex flex-col items-center justify-center text-[10px]`}>
                                                    <ImageIcon className="w-3 h-3 mb-1"/> Blur
                                                </button>
                                                <button onClick={() => fileInputRef.current?.click()} className="aspect-video rounded border border-dashed border-app-border hover:border-indigo-500/50 flex flex-col items-center justify-center text-[10px] hover:text-indigo-500">
                                                    <Upload className="w-3 h-3 mb-1"/> Upload
                                                </button>
                                                {customBackgrounds.map((bg, idx) => (
                                                    <button key={idx} onClick={() => setVisualConfig(p => ({...p, backgroundType: 'image', backgroundImage: bg}))} className={`aspect-video rounded border ${visualConfig.backgroundImage === bg ? 'border-indigo-500' : 'border-app-border'} bg-cover bg-center`} style={{ backgroundImage: `url('${bg}')` }} />
                                                ))}
                                            </div>
                                            
                                            {visualConfig.backgroundType === 'blur' && (
                                                <div className="mt-3">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-bold uppercase text-content-medium">Blur Strength</span>
                                                        <span className="text-[10px] font-mono text-content-high">{visualConfig.blurAmount}%</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" value={visualConfig.blurAmount} onChange={(e) => setVisualConfig(p => ({...p, blurAmount: parseInt(e.target.value)}))} className="w-full h-1 bg-app-border rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'audio' && (
                                     <div className="space-y-4 animate-slide-up">
                                         <div className="p-4 rounded-lg bg-app-bg border border-app-border">
                                            <div className="flex items-center gap-3 mb-3">
                                                <Volume2 className="w-5 h-5 text-content-medium" />
                                                <span className="text-sm font-semibold text-content-high">Microphone Check</span>
                                            </div>
                                            <div className="h-2 w-full bg-app-border rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-75 ${volumeLevel > 200 ? 'bg-red-500' : 'bg-green-500'}`} 
                                                    style={{ width: `${Math.min(100, (volumeLevel / 100) * 100)}%` }} 
                                                /> 
                                            </div>
                                            <p className="text-xs text-content-medium mt-2">Speak to test your microphone.</p>
                                         </div>
                                     </div>
                                )}

                                {activeTab === 'recording' && (
                                    <div className="space-y-4 animate-slide-up">
                                        <SettingsToggle label="Enable Local Recording" checked={recordingConfig.localRecording} onChange={() => setRecordingConfig(p => ({...p, localRecording: !p.localRecording}))} />
                                        {recordingConfig.localRecording && (
                                            <div className="p-3 bg-app-bg border border-app-border rounded text-xs text-content-medium flex gap-2">
                                                <Disc className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                                <span>
                                                    High-quality ISO recording will be saved to your device locally.
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-8 border-t border-app-border bg-app-surface/50">
                        <Button onClick={handleEnter} size="lg" className="w-full" disabled={!displayName}>
                            {isMeeting ? 'Join Meeting' : 'Enter Studio'}
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
