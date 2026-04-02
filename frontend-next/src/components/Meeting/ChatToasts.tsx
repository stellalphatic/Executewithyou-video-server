'use client';
import React, { useEffect, useState } from 'react';
import { ChatMessage } from '@/types';

interface ChatToastsProps {
    messages: ChatMessage[];
    isChatOpen: boolean;
}

export const ChatToasts: React.FC<ChatToastsProps> = ({ messages, isChatOpen }) => {
    const [toasts, setToasts] = useState<ChatMessage[]>([]);

    useEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        
        // Don't show toast if chat is open, if it's from local user, or if it's a system message
        if (isChatOpen || lastMsg.senderId === 'local' || lastMsg.isSystem) return;

        // Check if we already have this toast to prevent duplicates from strict mode
        setToasts((prev) => {
            if (prev.find(t => t.id === lastMsg.id)) return prev;
            return [...prev, lastMsg];
        });

        // Remove toast after 4 seconds
        const timer = setTimeout(() => {
            setToasts((prev) => prev.filter((m) => m.id !== lastMsg.id));
        }, 4000);

        return () => clearTimeout(timer);
    }, [messages, isChatOpen]);

    if (toasts.length === 0) return null;

    return (
        <div className="absolute top-20 right-6 flex flex-col gap-2 z-50 pointer-events-none">
            {toasts.map((toast) => (
                <div key={toast.id} className="bg-[#1A1A1A]/90 backdrop-blur-md border border-gray-700 rounded-xl px-4 py-3 shadow-2xl animate-slide-left max-w-sm">
                    <p className="text-xs text-emerald-400 font-bold mb-1">{toast.senderName}</p>
                    <p className="text-sm text-white break-words">{toast.text}</p>
                </div>
            ))}
            <style>{`
                @keyframes slideLeftToast {
                    from { opacity: 0; transform: translateX(50px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .animate-slide-left {
                    animation: slideLeftToast 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};
