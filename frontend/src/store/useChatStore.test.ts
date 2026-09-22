import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './useChatStore';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('inicia vacío y cerrado', () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.isOpen).toBe(false);
    expect(state.unreadCount).toBe(0);
  });

  it('incrementa unreadCount cuando llega un mensaje y el chat está cerrado', () => {
    useChatStore.getState().addMessage({
      id: 'm1',
      sesionId: 's1',
      usuarioId: 'u1',
      autorNombre: 'Juan',
      contenido: 'Hola',
      timestamp: new Date().toISOString(),
    });

    expect(useChatStore.getState().messages.length).toBe(1);
    expect(useChatStore.getState().unreadCount).toBe(1);
  });

  it('no incrementa unreadCount si el chat ya está abierto', () => {
    useChatStore.getState().setIsOpen(true);
    useChatStore.getState().addMessage({
      id: 'm2',
      sesionId: 's1',
      usuarioId: 'u1',
      autorNombre: 'Juan',
      contenido: 'Hola de nuevo',
      timestamp: new Date().toISOString(),
    });

    expect(useChatStore.getState().messages.length).toBe(1);
    expect(useChatStore.getState().unreadCount).toBe(0);
  });

  it('evita mensajes duplicados con el mismo ID', () => {
    const msg = {
      id: 'm-dup',
      sesionId: 's1',
      usuarioId: 'u1',
      autorNombre: 'Juan',
      contenido: 'Único',
      timestamp: new Date().toISOString(),
    };
    useChatStore.getState().addMessage(msg);
    useChatStore.getState().addMessage(msg);

    expect(useChatStore.getState().messages.length).toBe(1);
  });

  it('limpia mensajes correctamente con clearMessages', () => {
    useChatStore.getState().addMessage({
      id: 'm3',
      sesionId: 's1',
      usuarioId: 'u1',
      autorNombre: 'Juan',
      contenido: 'Para borrar',
      timestamp: new Date().toISOString(),
    });
    expect(useChatStore.getState().messages.length).toBe(1);

    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().messages.length).toBe(0);
    expect(useChatStore.getState().unreadCount).toBe(0);
  });
});
