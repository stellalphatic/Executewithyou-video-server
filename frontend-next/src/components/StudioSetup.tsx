'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    Mic, MicOff, Video, VideoOff, Settings, X, Upload, ImageIcon, 
    Sliders, Disc, Monitor, User, ArrowRight, Volume2, CheckCircle2,
    AlertCircle, ChevronDown, Camera, Gauge, Film, Clock, HardDrive, Cloud
} from 'lucide-react';
import { Button } from './Button';
import { VisualConfigType, RecordingConfig } from '@/types';
import { VideoProcessor } from '@/utils/VideoProcessor';

// Extended props to include recording config
interface StudioSetupProps {
    onEnterStudio: (
        displayName: string, 
        cam: boolean, 
        mic: boolean, 
        visualConfig: VisualConfigType,
        resolution: string,
        frameRate: number,
        recordingConfig: RecordingConfig
    ) => void;
    defaultName: string;
    isMeeting?: boolean;
}

interface CameraCapability {
    width: number;
    height: number;
    label: string;
}

interface FrameRateOption {
    value: number;
    label: string;
}

const SettingsToggle = ({ label, checked, onChange, description }: { 
    label: string, 
    checked: boolean, 
    onChange: () => void,
    description?: string 
}) => (
    <div className="flex items-center justify-between cursor-pointer py-2 group" onClick={onChange}>
        <div>
            <span className="text-sm font-medium text-content-high group-hover:text-indigo-400 transition-colors">{label}</span>
            {description && <p className="text-xs text-content-medium mt-0.5">{description}</p>}
        </div>
        <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-indigo-500' : 'bg-app-border'}`}>
            <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
    </div>
);

const RadioOption = ({ 
    label, 
    selected, 
    onChange, 
    description,
    name 
}: { 
    label: string, 
    selected: boolean, 
    onChange: () => void,
    description?: string,
    name: string
}) => (
    <label className="flex items-start gap-3 cursor-pointer py-2 group">
        <div className="mt-0.5">
            <input 
                type="radio" 
                name={name}
                checked={selected} 
                onChange={onChange}
                className="sr-only"
            />
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? 'border-indigo-500 bg-indigo-500' : 'border-app-border group-hover:border-content-medium'}`}>
                {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
        </div>
        <div className="flex-1">
            <span className="text-sm font-medium text-content-high group-hover:text-indigo-400 transition-colors">{label}</span>
            {description && <p className="text-xs text-content-medium mt-0.5">{description}</p>}
        </div>
    </label>
);

const SelectDropdown = ({ 
    value, 
    onChange, 
    options, 
    label, 
    icon 
}: { 
    value: string | number, 
    onChange: (val: any) => void, 
    options: { value: any, label: string }[],
    label: string,
    icon: React.ReactNode
}) => (
    <div className="space-y-2">
        <label className="text-xs font-bold text-content-medium uppercase tracking-wider flex items-center gap-2">
            {icon}
            {label}
        </label>
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-3 text-sm text-content-high focus:border-indigo-500 focus:outline-none transition-colors appearance-none cursor-pointer"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium pointer-events-none" />
        </div>
    </div>
);

export const StudioSetup: React.FC<StudioSetupProps> = ({ onEnterStudio, defaultName, isMeeting }) => {
    const [displayName, setDisplayName] = useState(defaultName);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [activeTab, setActiveTab] = useState<'general' | 'visual_effects' | 'audio' | 'recording'>('general');
    
    // Device lists
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
    const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
    
    // Camera capabilities (actual supported resolutions/fps)
    const [supportedResolutions, setSupportedResolutions] = useState<CameraCapability[]>([]);
    const [supportedFrameRates, setSupportedFrameRates] = useState<FrameRateOption[]>([]);
    const [selectedResolution, setSelectedResolution] = useState<string>('1280x720');
    const [selectedFrameRate, setSelectedFrameRate] = useState<number>(30);
    
    // Processing backend status
    const [processingBackend, setProcessingBackend] = useState<'webgl' | 'webcodecs' | 'canvas' | 'detecting'>('detecting');
    
    // Preview Stream
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
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

    // Recording Config
    const [recordingConfig, setRecordingConfig] = useState<RecordingConfig>({
        enableMixedRecording: false,
        enableIsoRecording: false,
        autoStartMode: 'none',
        showHostName: true,
        destination: 'local',
        cloudAutoUpload: false
    });

    // System checks
    const [systemChecks, setSystemChecks] = useState({
        camera: false,
        microphone: false,
        webgl: false,
        network: true
    });

    const processorRef = useRef<VideoProcessor | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Detect processing backend (WebGL > WebCodecs > Canvas)
    useEffect(() => {
        const detectBackend = async () => {
            const canvas = document.createElement('canvas');
            const gl2 = canvas.getContext('webgl2', { powerPreference: 'high-performance' });
            if (gl2) {
                setProcessingBackend('webgl');
                setSystemChecks(prev => ({ ...prev, webgl: true }));
                console.log('[StudioSetup] Using WebGL2 backend (GPU accelerated)');
                return;
            }
            
            const gl1 = canvas.getContext('webgl');
            if (gl1) {
                setProcessingBackend('webgl');
                setSystemChecks(prev => ({ ...prev, webgl: true }));
                console.log('[StudioSetup] Using WebGL1 backend (GPU accelerated)');
                return;
            }
            
            if ('VideoEncoder' in window && 'VideoDecoder' in window) {
                setProcessingBackend('webcodecs');
                console.log('[StudioSetup] Using WebCodecs backend');
                return;
            }
            
            setProcessingBackend('canvas');
            console.log('[StudioSetup] Using Canvas2D backend (CPU fallback)');
        };
        
        detectBackend();
    }, []);

    // Initialize Video Processor
    useEffect(() => {
        const processor = new VideoProcessor();
        processor.init().then(() => { 
            processorRef.current = processor; 
        });
        return () => { 
            if (processorRef.current) {
                processorRef.current.stop(); 
                processorRef.current = null;
            }
        };
    }, []);

    // Enumerate devices
    useEffect(() => {
        const enumerateDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                    .then(stream => stream.getTracks().forEach(t => t.stop()));
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                
                setVideoDevices(videoInputs);
                setAudioDevices(audioInputs);
                
                if (videoInputs.length > 0 && !selectedVideoDevice) {
                    setSelectedVideoDevice(videoInputs[0].deviceId);
                }
                if (audioInputs.length > 0 && !selectedAudioDevice) {
                    setSelectedAudioDevice(audioInputs[0].deviceId);
                }
            } catch (e) {
                console.error('Failed to enumerate devices:', e);
            }
        };
        
        enumerateDevices();
    }, []);

    // Query camera capabilities when video device changes
    const queryCameraCapabilities = useCallback(async (deviceId: string) => {
        if (!deviceId) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } }
            });
            
            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
                width?: { min?: number; max?: number };
                height?: { min?: number; max?: number };
                frameRate?: { min?: number; max?: number };
            };
            
            stream.getTracks().forEach(t => t.stop());
            
            if (capabilities) {
                const resolutions: CameraCapability[] = [];
                const commonResolutions = [
                    { width: 3840, height: 2160, label: '4K (3840×2160)' },
                    { width: 2560, height: 1440, label: '1440p (2560×1440)' },
                    { width: 1920, height: 1080, label: '1080p (1920×1080)' },
                    { width: 1280, height: 720, label: '720p (1280×720)' },
                    { width: 854, height: 480, label: '480p (854×480)' },
                    { width: 640, height: 360, label: '360p (640×360)' },
                ];
                
                const maxW = capabilities.width?.max || 1920;
                const maxH = capabilities.height?.max || 1080;
                
                for (const res of commonResolutions) {
                    if (res.width <= maxW && res.height <= maxH) {
                        resolutions.push(res);
                    }
                }
                
                if (resolutions.length === 0) {
                    resolutions.push({ width: maxW, height: maxH, label: `${maxW}×${maxH}` });
                }
                
                setSupportedResolutions(resolutions);
                
                const default720 = resolutions.find(r => r.width === 1280);
                if (default720) {
                    setSelectedResolution(`${default720.width}x${default720.height}`);
                } else if (resolutions.length > 0) {
                    setSelectedResolution(`${resolutions[0].width}x${resolutions[0].height}`);
                }
                
                const frameRates: FrameRateOption[] = [];
                const commonFps = [60, 50, 30, 25, 24, 15];
                const maxFps = capabilities.frameRate?.max || 30;
                
                for (const fps of commonFps) {
                    if (fps <= maxFps) {
                        frameRates.push({ value: fps, label: `${fps} fps` });
                    }
                }
                
                if (frameRates.length === 0) {
                    frameRates.push({ value: Math.floor(maxFps), label: `${Math.floor(maxFps)} fps` });
                }
                
                setSupportedFrameRates(frameRates);
                
                const default30 = frameRates.find(f => f.value === 30);
                if (default30) {
                    setSelectedFrameRate(30);
                } else if (frameRates.length > 0) {
                    setSelectedFrameRate(frameRates[0].value);
                }
                
            } else {
                setSupportedResolutions([
                    { width: 1920, height: 1080, label: '1080p (1920×1080)' },
                    { width: 1280, height: 720, label: '720p (1280×720)' },
                    { width: 640, height: 480, label: '480p (640×480)' },
                ]);
                setSupportedFrameRates([
                    { value: 60, label: '60 fps' },
                    { value: 30, label: '30 fps' },
                    { value: 24, label: '24 fps' },
                ]);
            }
        } catch (e) {
            console.error('Failed to query camera capabilities:', e);
            setSupportedResolutions([
                { width: 1280, height: 720, label: '720p (1280×720)' },
            ]);
            setSupportedFrameRates([
                { value: 30, label: '30 fps' },
            ]);
        }
    }, []);

    // Query capabilities when device changes
    useEffect(() => {
        if (selectedVideoDevice) {
            queryCameraCapabilities(selectedVideoDevice);
        }
    }, [selectedVideoDevice, queryCameraCapabilities]);

    // Media Initialization
    useEffect(() => {
        let mounted = true;

        const initMedia = async () => {
            try {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }

                const [width, height] = selectedResolution.split('x').map(Number);
                
                const constraints: MediaStreamConstraints = {
                    video: selectedVideoDevice ? {
                        deviceId: { exact: selectedVideoDevice },
                        width: { ideal: width || 1280 },
                        height: { ideal: height || 720 },
                        frameRate: { ideal: selectedFrameRate || 30 }
                    } : {
                        width: { ideal: width || 1280 },
                        height: { ideal: height || 720 },
                        frameRate: { ideal: selectedFrameRate || 30 }
                    },
                    audio: selectedAudioDevice ? {
                        deviceId: { exact: selectedAudioDevice }
                    } : true
                };
                
                const localStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                if (!mounted) {
                    localStream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = localStream;
                setSystemChecks(prev => ({ ...prev, camera: true, microphone: true }));
                
                // Setup Audio Analysis
                try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContextClass && !audioContextRef.current) {
                        const audioCtx = new AudioContextClass();
                        const analyser = audioCtx.createAnalyser();
                        const source = audioCtx.createMediaStreamSource(localStream);
                        source.connect(analyser);
                        analyser.fftSize = 256;
                        analyser.smoothingTimeConstant = 0.8;
                        
                        audioContextRef.current = audioCtx;
                        analyserRef.current = analyser;

                        const dataArray = new Uint8Array(analyser.frequencyBinCount);

                        const updateVolume = () => {
                            if (!mounted || !analyserRef.current) return;
                            
                            analyserRef.current.getByteFrequencyData(dataArray);
                            let sum = 0;
                            for (let i = 0; i < dataArray.length; i++) {
                                sum += dataArray[i] * dataArray[i];
                            }
                            const rms = Math.sqrt(sum / dataArray.length);
                            const normalizedVolume = Math.min(100, (rms / 128) * 100);
                            setVolumeLevel(normalizedVolume);
                            
                            rafRef.current = requestAnimationFrame(updateVolume);
                        };
                        updateVolume();
                    }
                } catch (err) {
                    console.warn("Audio Context init failed", err);
                }

                if (videoRef.current) {
                    videoRef.current.srcObject = localStream;
                }

            } catch (e) {
                console.error("Camera access failed", e);
                setVideoEnabled(false);
                setSystemChecks(prev => ({ ...prev, camera: false }));
            }
        };

        initMedia();
        
        return () => {
            mounted = false;
        };
    }, [selectedVideoDevice, selectedAudioDevice, selectedResolution, selectedFrameRate]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };
    }, []);

    // Handle Toggles
    useEffect(() => {
        if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach(t => t.enabled = audioEnabled);
            streamRef.current.getVideoTracks().forEach(t => t.enabled = videoEnabled);
        }
    }, [audioEnabled, videoEnabled]);

    // Handle Visual Effects
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
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        
        if (processorRef.current) {
            processorRef.current.stop();
        }

        // Store config in sessionStorage for the studio page to read
        const studioConfig = {
            displayName,
            audioEnabled,
            videoEnabled,
            visualConfig,
            resolution: selectedResolution,
            frameRate: selectedFrameRate,
            recordingConfig,
            videoDeviceId: selectedVideoDevice,
            audioDeviceId: selectedAudioDevice
        };
        sessionStorage.setItem('studioSetupConfig', JSON.stringify(studioConfig));

        onEnterStudio(
            displayName, 
            videoEnabled, 
            audioEnabled, 
            visualConfig,
            selectedResolution,
            selectedFrameRate,
            recordingConfig
        );
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    const result = ev.target.result as string;
                    setVisualConfig(p => ({...p, backgroundType: 'image', backgroundImage: result}));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const allChecksPass = systemChecks.camera && systemChecks.microphone;

    return (
        <div className="h-screen w-full bg-app-bg text-content-high flex items-center justify-center p-8 animate-fade-in">
            <div className="w-full max-w-6xl h-[700px] bg-app-bg border border-app-border rounded-2xl shadow-2xl flex overflow-hidden">
                
                {/* Left: Preview */}
                <div className="w-[55%] bg-black relative p-6 flex flex-col justify-between">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 z-10 pointer-events-none" />
                    
                    <div className="relative z-20 flex justify-between items-start">
                        <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-white/90">
                            {isMeeting ? 'Meeting Preview' : 'Studio Preview'}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${processingBackend === 'webgl' ? 'bg-emerald-500/20 text-emerald-400' : processingBackend === 'canvas' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {processingBackend === 'detecting' ? 'Detecting...' : processingBackend.toUpperCase()}
                            </div>
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

                    {/* Audio Level Indicator */}
                    {audioEnabled && (
                        <div className="absolute bottom-24 left-6 right-6 z-20">
                            <div className="bg-black/40 backdrop-blur-md rounded-lg p-3 border border-white/10">
                                <div className="flex items-center gap-3">
                                    <Volume2 className="w-4 h-4 text-white/70" />
                                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-75 rounded-full ${volumeLevel > 80 ? 'bg-red-500' : volumeLevel > 50 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${volumeLevel}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-white/50 w-8">{Math.round(volumeLevel)}%</span>
                                </div>
                            </div>
                        </div>
                    )}

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
                <div className="w-[45%] bg-app-surface flex flex-col">
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <h2 className="text-2xl font-bold text-content-high mb-6">{isMeeting ? 'Join Meeting' : 'Get ready to stream'}</h2>
                        
                        <div className="space-y-5">
                            {/* Display Name */}
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

                            {/* Tabs */}
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

                            <div className="min-h-[280px]">
                                {/* General Tab */}
                                {activeTab === 'general' && (
                                    <div className="space-y-4 animate-slide-up">
                                        {/* Camera Selection */}
                                        <SelectDropdown
                                            value={selectedVideoDevice}
                                            onChange={setSelectedVideoDevice}
                                            options={videoDevices.map(d => ({ value: d.deviceId, label: d.label || `Camera ${videoDevices.indexOf(d) + 1}` }))}
                                            label="Camera"
                                            icon={<Camera className="w-3 h-3" />}
                                        />
                                        
                                        {/* Resolution Selection */}
                                        <SelectDropdown
                                            value={selectedResolution}
                                            onChange={setSelectedResolution}
                                            options={supportedResolutions.map(r => ({ value: `${r.width}x${r.height}`, label: r.label }))}
                                            label="Resolution"
                                            icon={<Monitor className="w-3 h-3" />}
                                        />
                                        
                                        {/* Frame Rate Selection */}
                                        <SelectDropdown
                                            value={selectedFrameRate}
                                            onChange={(v) => setSelectedFrameRate(Number(v))}
                                            options={supportedFrameRates.map(f => ({ value: f.value, label: f.label }))}
                                            label="Frame Rate"
                                            icon={<Gauge className="w-3 h-3" />}
                                        />

                                        {/* System Check */}
                                        <div className="p-4 rounded-lg bg-app-bg border border-app-border space-y-2 mt-4">
                                            <div className="flex items-center gap-3">
                                                <Monitor className="w-5 h-5 text-indigo-500" />
                                                <span className="text-sm font-semibold text-content-high">System Check</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="flex items-center gap-2">
                                                    {systemChecks.camera ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
                                                    <span className="text-content-medium">Camera</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {systemChecks.microphone ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
                                                    <span className="text-content-medium">Microphone</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {systemChecks.webgl ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-amber-500" />}
                                                    <span className="text-content-medium">GPU Acceleration</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {systemChecks.network ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
                                                    <span className="text-content-medium">Network</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Visual Effects Tab */}
                                {activeTab === 'visual_effects' && (
                                    <div className="space-y-5 animate-slide-up">
                                        <div className="space-y-2">
                                            <SettingsToggle 
                                                label="Enhance skin appearance" 
                                                checked={visualConfig.skinEnhance} 
                                                onChange={() => setVisualConfig(p => ({...p, skinEnhance: !p.skinEnhance}))}
                                                description="Smooths skin for a professional look"
                                            />
                                            <SettingsToggle 
                                                label="I have a green screen" 
                                                checked={visualConfig.greenScreen} 
                                                onChange={() => setVisualConfig(p => ({...p, greenScreen: !p.greenScreen}))}
                                                description="Enable chroma key for physical green screens"
                                            />
                                        </div>
                                        
                                        <div className="pt-4 border-t border-app-border/50">
                                            <h3 className="text-xs font-bold text-content-medium uppercase tracking-wider mb-3">Virtual Backgrounds</h3>
                                            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
                                            <div className="grid grid-cols-4 gap-2">
                                                <button 
                                                    onClick={() => setVisualConfig(p => ({...p, backgroundType: 'none', backgroundImage: ''}))} 
                                                    className={`aspect-video rounded border ${visualConfig.backgroundType === 'none' ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border bg-app-bg hover:border-content-low'} flex flex-col items-center justify-center text-[10px] transition-colors`}
                                                >
                                                    <X className="w-3 h-3 mb-1"/> None
                                                </button>
                                                <button 
                                                    onClick={() => setVisualConfig(p => ({...p, backgroundType: 'blur', backgroundImage: ''}))} 
                                                    className={`aspect-video rounded border ${visualConfig.backgroundType === 'blur' ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border bg-app-bg hover:border-content-low'} flex flex-col items-center justify-center text-[10px] transition-colors`}
                                                >
                                                    <ImageIcon className="w-3 h-3 mb-1"/> Blur
                                                </button>
                                                <button 
                                                    onClick={() => fileInputRef.current?.click()} 
                                                    className="aspect-video rounded border border-dashed border-app-border hover:border-indigo-500/50 flex flex-col items-center justify-center text-[10px] hover:text-indigo-500 transition-colors"
                                                >
                                                    <Upload className="w-3 h-3 mb-1"/> Upload
                                                </button>
                                            </div>
                                            
                                            {visualConfig.backgroundType === 'blur' && (
                                                <div className="mt-4">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-bold uppercase text-content-medium">Blur Strength</span>
                                                        <span className="text-xs font-mono text-content-high">{visualConfig.blurAmount}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="100" 
                                                        value={visualConfig.blurAmount} 
                                                        onChange={(e) => setVisualConfig(p => ({...p, blurAmount: parseInt(e.target.value)}))} 
                                                        className="w-full h-2 bg-app-border rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Audio Tab */}
                                {activeTab === 'audio' && (
                                     <div className="space-y-4 animate-slide-up">
                                         {/* Microphone Selection */}
                                         <SelectDropdown
                                            value={selectedAudioDevice}
                                            onChange={setSelectedAudioDevice}
                                            options={audioDevices.map(d => ({ value: d.deviceId, label: d.label || `Microphone ${audioDevices.indexOf(d) + 1}` }))}
                                            label="Microphone"
                                            icon={<Mic className="w-3 h-3" />}
                                        />
                                         
                                         <div className="p-4 rounded-lg bg-app-bg border border-app-border">
                                            <div className="flex items-center gap-3 mb-3">
                                                <Volume2 className="w-5 h-5 text-content-medium" />
                                                <span className="text-sm font-semibold text-content-high">Microphone Test</span>
                                            </div>
                                            <div className="h-3 w-full bg-app-border rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-100 rounded-full ${volumeLevel > 80 ? 'bg-red-500' : volumeLevel > 50 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${volumeLevel}%` }} 
                                                /> 
                                            </div>
                                            <p className="text-xs text-content-medium mt-3">Speak to test your microphone. The bar should move as you talk.</p>
                                         </div>
                                     </div>
                                )}

                                {/* Recording Tab */}
                                {activeTab === 'recording' && (
                                    <div className="space-y-4 animate-slide-up">
                                        {/* Recording Type */}
                                        <div className="p-4 rounded-lg bg-app-bg border border-app-border">
                                            <div className="flex items-center gap-3 mb-4">
                                                <Film className="w-5 h-5 text-indigo-500" />
                                                <span className="text-sm font-semibold text-content-high">Recording Type</span>
                                            </div>
                                            
                                            <div className="space-y-3">
                                                <SettingsToggle 
                                                    label="Mixed Recording (Program Feed)" 
                                                    checked={recordingConfig.enableMixedRecording} 
                                                    onChange={() => setRecordingConfig(p => ({...p, enableMixedRecording: !p.enableMixedRecording}))}
                                                    description="Records the final composed output as seen by viewers"
                                                />
                                                <SettingsToggle 
                                                    label="ISO Recording (Individual Tracks)" 
                                                    checked={recordingConfig.enableIsoRecording} 
                                                    onChange={() => setRecordingConfig(p => ({...p, enableIsoRecording: !p.enableIsoRecording}))}
                                                    description="Records each participant separately for post-production"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Auto-Start Recording - Radio Based */}
                                        {(recordingConfig.enableMixedRecording || recordingConfig.enableIsoRecording) && (
                                            <div className="p-4 rounded-lg bg-app-bg border border-app-border">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <Clock className="w-5 h-5 text-indigo-500" />
                                                    <span className="text-sm font-semibold text-content-high">Auto-Start Recording</span>
                                                </div>
                                                
                                                <div className="space-y-1">
                                                    <RadioOption 
                                                        name="autoStartMode"
                                                        label="Manual start" 
                                                        selected={recordingConfig.autoStartMode === 'none'} 
                                                        onChange={() => setRecordingConfig(p => ({...p, autoStartMode: 'none'}))}
                                                        description="Start recording manually when ready"
                                                    />
                                                    <RadioOption 
                                                        name="autoStartMode"
                                                        label="Start when going live" 
                                                        selected={recordingConfig.autoStartMode === 'on_live'} 
                                                        onChange={() => setRecordingConfig(p => ({...p, autoStartMode: 'on_live'}))}
                                                        description="Begin recording automatically when broadcast starts"
                                                    />
                                                    <RadioOption 
                                                        name="autoStartMode"
                                                        label="Start from beginning" 
                                                        selected={recordingConfig.autoStartMode === 'from_start'} 
                                                        onChange={() => setRecordingConfig(p => ({...p, autoStartMode: 'from_start'}))}
                                                        description="Begin recording immediately when entering studio"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Recording Destination - Cloud/Local */}
                                        {(recordingConfig.enableMixedRecording || recordingConfig.enableIsoRecording) && (
                                            <div className="p-4 rounded-lg bg-app-bg border border-app-border">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <HardDrive className="w-5 h-5 text-indigo-500" />
                                                    <span className="text-sm font-semibold text-content-high">Recording Destination</span>
                                                </div>
                                                
                                                <div className="space-y-1">
                                                    <RadioOption 
                                                        name="recordingDestination"
                                                        label="Local only" 
                                                        selected={recordingConfig.destination === 'local'} 
                                                        onChange={() => setRecordingConfig(p => ({...p, destination: 'local'}))}
                                                        description="Save recordings directly to your device"
                                                    />
                                                    <RadioOption 
                                                        name="recordingDestination"
                                                        label="Cloud only" 
                                                        selected={recordingConfig.destination === 'cloud'} 
                                                        onChange={() => setRecordingConfig(p => ({...p, destination: 'cloud'}))}
                                                        description="Upload recordings to cloud storage (requires PRO tier)"
                                                    />
                                                    <RadioOption 
                                                        name="recordingDestination"
                                                        label="Both (Local + Cloud)" 
                                                        selected={recordingConfig.destination === 'both'} 
                                                        onChange={() => setRecordingConfig(p => ({...p, destination: 'both'}))}
                                                        description="Save locally and upload to cloud for redundancy"
                                                    />
                                                </div>
                                                
                                                {recordingConfig.destination === 'local' && (
                                                    <div className="mt-3 pt-3 border-t border-app-border">
                                                        <SettingsToggle 
                                                            label="Auto-upload when online" 
                                                            checked={recordingConfig.cloudAutoUpload} 
                                                            onChange={() => setRecordingConfig(p => ({...p, cloudAutoUpload: !p.cloudAutoUpload}))}
                                                            description="Automatically upload local recordings to cloud when connection is available"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* Display Options */}
                                        <div className="p-4 rounded-lg bg-app-bg border border-app-border">
                                            <div className="flex items-center gap-3 mb-4">
                                                <User className="w-5 h-5 text-indigo-500" />
                                                <span className="text-sm font-semibold text-content-high">Display Options</span>
                                            </div>
                                            
                                            <SettingsToggle 
                                                label="Show host name" 
                                                checked={recordingConfig.showHostName} 
                                                onChange={() => setRecordingConfig(p => ({...p, showHostName: !p.showHostName}))}
                                                description="Display your name overlay on the video feed"
                                            />
                                        </div>
                                        
                                        {!recordingConfig.enableMixedRecording && !recordingConfig.enableIsoRecording && (
                                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400 flex gap-2">
                                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                <span>No recording enabled. You can still start recording manually in the studio.</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-app-border bg-app-surface/50">
                        <Button onClick={handleEnter} size="lg" className="w-full" disabled={!displayName || !allChecksPass}>
                            {isMeeting ? 'Join Meeting' : 'Enter Studio'}
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                        {!allChecksPass && (
                            <p className="text-xs text-red-400 mt-2 text-center">Please grant camera and microphone permissions to continue</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
