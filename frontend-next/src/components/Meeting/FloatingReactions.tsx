'use client';
import React, { useEffect, useState } from 'react';

interface Reaction {
    id: string;
    emoji: string;
    senderName?: string;
    left: number;
}

export const FloatingReactions: React.FC = () => {
    const [reactions, setReactions] = useState<Reaction[]>([]);

    useEffect(() => {
        const handleReaction = (e: Event) => {
            const customEvent = e as CustomEvent;
            const { emoji, senderName } = customEvent.detail;
            const newReaction = {
                id: Math.random().toString(36).substring(2, 9),
                emoji,
                senderName,
                left: Math.random() * 60 + 20, // Random left offset 20-80%
            };
            setReactions((prev) => [...prev, newReaction]);

            // Remove reaction after animation finishes
            setTimeout(() => {
                setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
            }, 3000);
        };

        window.addEventListener('meeting-reaction', handleReaction);
        return () => window.removeEventListener('meeting-reaction', handleReaction);
    }, []);

    if (reactions.length === 0) return null;

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64 h-64 pointer-events-none z-50">
            <style>{`
                @keyframes floatUp {
                    0% {
                        opacity: 0;
                        transform: translateY(0) scale(0.5);
                    }
                    10% {
                        opacity: 1;
                        transform: translateY(-10px) scale(1.2);
                    }
                    20% {
                        transform: translateY(-20px) scale(1);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-150px) scale(1);
                    }
                }
            `}</style>
            {reactions.map((r) => (
                <div
                    key={r.id}
                    className="absolute bottom-0 flex flex-col items-center"
                    style={{ 
                        left: `${r.left}%`,
                        animation: 'floatUp 3s ease-out forwards',
                        willChange: 'transform, opacity'
                    }}
                >
                    <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
                    {r.senderName && (
                        <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded-full mt-1 whitespace-nowrap backdrop-blur-sm">
                            {r.senderName}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
};
