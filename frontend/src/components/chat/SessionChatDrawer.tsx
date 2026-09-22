import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Trash2, X } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import type { PresenceUser } from '../../types/realtime';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (contenido: string) => Promise<boolean>;
  onClearChat?: () => Promise<boolean>;
  currentUserId?: string;
  currentUserName?: string;
  isHost: boolean;
  presenceUsers: PresenceUser[];
}

export default function SessionChatDrawer({
  isOpen,
  onClose,
  onSendMessage,
  onClearChat,
  currentUserId,
  currentUserName,
  isHost,
  presenceUsers,
}: Props) {
  const messages = useChatStore(s => s.messages);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive or drawer opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages.length]);

  // Color lookup by userId
  const userColorMap = useMemo(() => {
    const map = new Map<string, string>();
    presenceUsers.forEach(u => map.set(u.userId, u.color));
    return map;
  }, [presenceUsers]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = text.trim();
    if (!clean || isSending) return;

    setIsSending(true);
    setSendError('');
    try {
      const ok = await onSendMessage(clean);
      if (ok) {
        setText('');
      } else {
        setSendError('No se pudo enviar el mensaje.');
      }
    } catch {
      setSendError('Error al enviar mensaje.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleClear = async () => {
    if (!onClearChat) return;
    try {
      await onClearChat();
      setShowConfirmClear(false);
    } catch {
      setSendError('No se pudo vaciar el historial.');
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Render text highlighting @mentions
  const renderMessageContent = (content: string) => {
    const mentionRegex = /(@[\wáéíóúÁÉÍÓÚñÑ]+)/g;
    const parts = content.split(mentionRegex);

    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const mentionTarget = part.slice(1).toLowerCase();
        const isSelf = currentUserName && currentUserName.toLowerCase().includes(mentionTarget);
        return (
          <span
            key={index}
            className={`uml-chat-mention ${isSelf ? 'is-self-mention' : ''}`}
            title={isSelf ? '¡Te mencionaron!' : undefined}
          >
            {part}
          </span>
        );
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  if (!isOpen) return null;

  return (
    <aside
      className="uml-chat-drawer"
      role="complementary"
      aria-label="Panel de chat de la sesión"
    >
      <header className="uml-chat-header">
        <div className="uml-chat-title-group">
          <MessageSquare size={18} className="uml-chat-icon" aria-hidden="true" />
          <h2>Chat de Sesión</h2>
          <span className="uml-chat-badge">{messages.length}</span>
        </div>
        <div className="uml-chat-actions">
          {isHost && (
            <button
              className="uml-chat-clear-btn"
              title="Vaciar historial de chat"
              aria-label="Vaciar historial"
              onClick={() => setShowConfirmClear(true)}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            className="uml-chat-close-btn"
            title="Cerrar chat"
            aria-label="Cerrar panel de chat"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {showConfirmClear && (
        <div className="uml-chat-confirm-bar" role="alert">
          <span>¿Vaciar todos los mensajes?</span>
          <button className="uml-confirm-yes" onClick={() => void handleClear()}>Sí, vaciar</button>
          <button className="uml-confirm-no" onClick={() => setShowConfirmClear(false)}>Cancelar</button>
        </div>
      )}

      {sendError && (
        <div className="uml-chat-error-bar" role="alert">
          <span>{sendError}</span>
          <button onClick={() => setSendError('')}>×</button>
        </div>
      )}

      <div className="uml-chat-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="uml-chat-empty">
            <MessageSquare size={32} />
            <p>No hay mensajes en esta sesión aún.</p>
            <span>Escribe abajo para coordinar con tu equipo. Usa <strong>@nombre</strong> para mencionar.</span>
          </div>
        ) : (
          messages.map(msg => {
            const isSelf = msg.usuarioId === currentUserId;
            const color = userColorMap.get(msg.usuarioId) || '#22D3A0';
            const initial = (msg.autorNombre || '?').charAt(0).toUpperCase();

            return (
              <div
                key={msg.id}
                className={`uml-chat-bubble-wrapper ${isSelf ? 'is-self' : 'is-other'}`}
              >
                {!isSelf && (
                  <div
                    className="uml-chat-avatar"
                    style={{ backgroundColor: color }}
                    title={msg.autorNombre}
                  >
                    {initial}
                  </div>
                )}
                <div className="uml-chat-bubble-content">
                  <div className="uml-chat-bubble-header">
                    <span className="uml-chat-author">
                      {isSelf ? `${msg.autorNombre} (Tú)` : msg.autorNombre}
                    </span>
                    <time className="uml-chat-time">{formatTime(msg.timestamp)}</time>
                  </div>
                  <div className="uml-chat-bubble-body">
                    {renderMessageContent(msg.contenido)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="uml-chat-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje... (Enter para enviar, @ para mencionar)"
          rows={2}
          maxLength={2000}
          aria-label="Mensaje para el chat"
        />
        <button
          type="submit"
          className="uml-chat-send-btn"
          disabled={!text.trim() || isSending}
          title="Enviar mensaje"
          aria-label="Enviar mensaje"
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
