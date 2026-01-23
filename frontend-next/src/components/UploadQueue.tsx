'use client';


import React from 'react';
import { UploadItem } from '@/types';
import { CheckCircle2, Cloud, FileVideo, X, RotateCw, AlertCircle, Loader2, Download } from 'lucide-react';

interface UploadQueueProps {
    items: UploadItem[];
    onRemove: (id: string) => void;
    onRetry: (id: string) => void;
}

export const UploadQueue: React.FC<UploadQueueProps> = ({ items, onRemove, onRetry }) => {
    if (items.length === 0) return null;

    return (
        <div className="flex flex-col border-t border-app-border bg-app-surface/30">
            <div className="p-3 bg-app-surface/50 border-b border-app-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-content-high uppercase tracking-wider">Cloud Uploads</span>
                </div>
                <span className="text-[10px] font-mono text-content-medium">{items.filter(i => i.status === 'completed').length} / {items.length}</span>
            </div>
            
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {items.map(item => (
                    <div key={item.id} className="bg-app-bg border border-app-border rounded-lg p-3 group relative overflow-hidden">
                        {/* Progress Bar Background */}
                        {item.status === 'uploading' && (
                            <div 
                                className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 transition-all duration-300"
                                style={{ width: `${item.progress}%` }}
                            />
                        )}

                        <div className="flex items-start gap-3 relative z-10">
                            <div className="w-8 h-8 rounded bg-app-surface border border-app-border flex items-center justify-center shrink-0">
                                {item.status === 'uploading' ? (
                                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                                ) : item.status === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                ) : item.status === 'error' ? (
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                ) : (
                                    <FileVideo className="w-4 h-4 text-content-medium" />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <div className="text-xs font-semibold text-content-high truncate" title={item.filename}>
                                        {item.filename}
                                    </div>
                                    {item.status === 'uploading' && (
                                        <span className="text-[10px] font-mono text-indigo-500">{item.progress}%</span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] text-content-medium">
                                        {(item.file.size / (1024 * 1024)).toFixed(2)} MB • {item.status}
                                    </div>
                                    
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Fallback Download */}
                                        <a 
                                            href={URL.createObjectURL(item.file)} 
                                            download={item.filename}
                                            className="p-1 hover:bg-app-surface rounded text-content-low hover:text-content-high"
                                            title="Download Local Copy"
                                        >
                                            <Download className="w-3 h-3" />
                                        </a>

                                        {item.status === 'error' && (
                                            <button 
                                                onClick={() => onRetry(item.id)}
                                                className="p-1 hover:bg-app-surface rounded text-content-low hover:text-indigo-500"
                                                title="Retry"
                                            >
                                                <RotateCw className="w-3 h-3" />
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => onRemove(item.id)}
                                            className="p-1 hover:bg-app-surface rounded text-content-low hover:text-red-500"
                                            title="Dismiss"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
