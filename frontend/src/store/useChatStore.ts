import { create } from 'zustand';
import { ChatMessage } from '../types/chat';

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  unreadCount: number;
  isLoading: boolean;
  error: string;

  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  resetUnread: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isOpen: false,
  unreadCount: 0,
  isLoading: false,
  error: '',

  setMessages: (messages) => set({ messages, error: '' }),

  addMessage: (message) => {
    const current = get();
    if (current.messages.some(m => m.id === message.id)) return;
    set({
      messages: [...current.messages, message],
      unreadCount: current.isOpen ? 0 : current.unreadCount + 1,
    });
  },

  clearMessages: () => set({ messages: [], unreadCount: 0, error: '' }),

  setIsOpen: (isOpen) => set({ isOpen, unreadCount: isOpen ? 0 : get().unreadCount }),

  toggleOpen: () => {
    const next = !get().isOpen;
    set({ isOpen: next, unreadCount: next ? 0 : get().unreadCount });
  },

  resetUnread: () => set({ unreadCount: 0 }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  reset: () => set({ messages: [], isOpen: false, unreadCount: 0, isLoading: false, error: '' }),
}));
