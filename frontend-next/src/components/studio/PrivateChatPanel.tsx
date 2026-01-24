'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, ChevronDown, MessageCircle, Users, X, Check } from 'lucide-react';
import { Participant } from '@/types';

interface Message {
    id: string;
    senderId: string;
    recipientId: string | 'all'; // 'all' for broadcast to all participants
    senderName: string;
    content: string;
    timestamp: number;
    isPrivate: boolean;
}

interface Conversation {
    participantId: string;
    participantName: string;
    messages: Message[];
    unread: number;
}

interface PrivateChatPanelProps {
    localParticipantId: string;
    localParticipantName: string;
    participants: Participant[];
    onSendMessage?: (recipientId: string, message: string, isPrivate: boolean) => void;
}

export const PrivateChatPanel: React.FC<PrivateChatPanelProps> = ({
    localParticipantId,
    localParticipantName,
    participants,
    onSendMessage
}) => {
    const [activeConversation, setActiveConversation] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [showParticipantList, setShowParticipantList] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initialize conversations from participants
    useEffect(() => {
        const existingIds = new Set(conversations.map(c => c.participantId));
        const newConversations = participants
            .filter(p => p.id !== localParticipantId && !existingIds.has(p.id))
            .map(p => ({
                participantId: p.id,
                participantName: p.display_name,
                messages: [],
                unread: 0
            }));
        
        if (newConversations.length > 0) {
            setConversations(prev => [...prev, ...newConversations]);
        }
        
        // Remove conversations for participants who left
        const currentIds = new Set(participants.map(p => p.id));
        setConversations(prev => prev.filter(c => currentIds.has(c.participantId)));
    }, [participants, localParticipantId, conversations]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConversation, conversations]);

    const handleSendMessage = useCallback(() => {
        if (!message.trim() || !activeConversation) return;

        const newMessage: Message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            senderId: localParticipantId,
            recipientId: activeConversation,
            senderName: localParticipantName,
            content: message.trim(),
            timestamp: Date.now(),
            isPrivate: activeConversation !== 'all'
        };

        // Add message to conversation
        setConversations(prev => prev.map(c => {
            if (c.participantId === activeConversation) {
                return { ...c, messages: [...c.messages, newMessage] };
            }
            return c;
        }));

        // Notify parent
        onSendMessage?.(activeConversation, message.trim(), activeConversation !== 'all');
        setMessage('');
        inputRef.current?.focus();
    }, [message, activeConversation, localParticipantId, localParticipantName, onSendMessage]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const startConversation = (participantId: string) => {
        setActiveConversation(participantId);
        setShowParticipantList(false);
        
        // Mark as read
        setConversations(prev => prev.map(c => {
            if (c.participantId === participantId) {
                return { ...c, unread: 0 };
            }
            return c;
        }));
    };

    const activeConv = conversations.find(c => c.participantId === activeConversation);
    const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (participants.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-app-bg border border-app-border flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 text-content-low" />
                </div>
                <h3 className="text-sm font-bold text-content-high mb-2">No Participants Yet</h3>
                <p className="text-xs text-content-medium">
                    Invite guests to your studio to start private conversations
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-app-surface/50 border-r border-app-border">
            {/* Header */}
            <div className="p-4 border-b border-app-border bg-app-surface flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-xs font-bold text-content-medium uppercase tracking-wider">
                        Private Chat
                    </h3>
                    {totalUnread > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                            {totalUnread}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => setShowParticipantList(true)}
                    className="p-1.5 hover:bg-app-bg rounded-lg transition-colors text-content-medium hover:text-content-high"
                    title="New conversation"
                >
                    <Users className="w-4 h-4" />
                </button>
            </div>

            {/* Conversation List or Active Chat */}
            {!activeConversation ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    <div className="space-y-1">
                        {conversations.map(conv => (
                            <button
                                key={conv.participantId}
                                onClick={() => startConversation(conv.participantId)}
                                className="w-full p-3 rounded-lg hover:bg-app-bg transition-colors flex items-center gap-3 group"
                            >
                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                                    {conv.participantName.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-content-high truncate">{conv.participantName}</span>
                                        {conv.unread > 0 && (
                                            <span className="bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                                {conv.unread}
                                            </span>
                                        )}
                                    </div>
                                    {conv.messages.length > 0 && (
                                        <p className="text-[10px] text-content-low truncate">
                                            {conv.messages[conv.messages.length - 1].content}
                                        </p>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* Active Chat Header */}
                    <div className="p-3 border-b border-app-border/50 flex items-center gap-3 bg-app-bg/50">
                        <button
                            onClick={() => setActiveConversation(null)}
                            className="p-1 hover:bg-app-surface rounded transition-colors"
                        >
                            <ChevronDown className="w-4 h-4 text-content-medium rotate-90" />
                        </button>
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-400">
                            {activeConv?.participantName.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-content-high">{activeConv?.participantName}</span>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                        {activeConv?.messages.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-[10px] text-content-low">
                                    Start a private conversation with {activeConv?.participantName}
                                </p>
                            </div>
                        ) : (
                            activeConv?.messages.map(msg => {
                                const isOwn = msg.senderId === localParticipantId;
                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                                    >
                                        <div
                                            className={`max-w-[85%] px-3 py-2 rounded-xl ${
                                                isOwn
                                                    ? 'bg-indigo-600 text-white rounded-br-sm'
                                                    : 'bg-app-bg border border-app-border text-content-high rounded-bl-sm'
                                            }`}
                                        >
                                            <p className="text-xs break-words">{msg.content}</p>
                                        </div>
                                        <span className="text-[9px] text-content-low mt-1 px-1">
                                            {formatTime(msg.timestamp)}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Message Input */}
                    <div className="p-3 border-t border-app-border bg-app-surface">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                className="flex-1 bg-app-bg border border-app-border rounded-lg px-3 py-2 text-xs text-content-high placeholder:text-content-low focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!message.trim()}
                                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-app-bg disabled:text-content-low text-white rounded-lg transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Participant Selector Modal */}
            {showParticipantList && (
                <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-xs bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-3 border-b border-app-border flex items-center justify-between">
                            <span className="text-xs font-bold text-content-high">Select Participant</span>
                            <button
                                onClick={() => setShowParticipantList(false)}
                                className="p-1 hover:bg-app-bg rounded transition-colors"
                            >
                                <X className="w-4 h-4 text-content-medium" />
                            </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {participants
                                .filter(p => p.id !== localParticipantId)
                                .map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => startConversation(p.id)}
                                        className="w-full p-3 hover:bg-app-bg transition-colors flex items-center gap-3 border-b border-app-border/50 last:border-0"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                                            {p.display_name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <span className="text-xs font-bold text-content-high">{p.display_name}</span>
                                            <span className="text-[9px] text-content-low block capitalize">{p.role}</span>
                                        </div>
                                        {conversations.find(c => c.participantId === p.id)?.unread ? (
                                            <span className="bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                                {conversations.find(c => c.participantId === p.id)?.unread}
                                            </span>
                                        ) : null}
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
