import { KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Eye, Pencil, Shield, UserX, X } from 'lucide-react';
import { getApiErrorMessage } from '../../services/api';
import { participantsApi, SessionParticipantsDetails } from '../../services/participantsApi';
import type { ParticipantPermission, PresenceUser } from '../../types/realtime';
import './ManageParticipantsModal.css';

interface Props {
  sessionId: string;
  presenceUsers: PresenceUser[];
  onClose(): void;
}

const focusableSelector = 'button:not([disabled]), select:not([disabled])';

export default function ManageParticipantsModal({ sessionId, presenceUsers, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cancelRemovalRef = useRef<HTMLButtonElement>(null);
  const returnFocusUserIdRef = useRef<string | null>(null);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [details, setDetails] = useState<SessionParticipantsDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const previousActive = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActive instanceof HTMLElement && previousActive.isConnected) previousActive.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    participantsApi.listar(sessionId)
      .then(result => { if (active) setDetails(result); })
      .catch(loadError => { if (active) setError(getApiErrorMessage(loadError, 'No se pudo cargar la lista de colaboradores.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, reload, presenceUsers]);

  useLayoutEffect(() => {
    if (confirmUserId) {
      cancelRemovalRef.current?.focus();
      return;
    }
    const targetUserId = returnFocusUserIdRef.current;
    if (!targetUserId) return;
    (removeButtonRefs.current.get(targetUserId) ?? closeRef.current)?.focus();
    returnFocusUserIdRef.current = null;
  }, [confirmUserId]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const onlineByUser = useMemo(() => {
    const result = new Map<string, PresenceUser>();
    presenceUsers.forEach(user => { if (!result.has(user.userId)) result.set(user.userId, user); });
    return result;
  }, [presenceUsers]);
  const orderedParticipants = useMemo(() => details ? [...details.participantes].sort((a, b) => {
    if (a.usuario.id === details.anfitrionId) return -1;
    if (b.usuario.id === details.anfitrionId) return 1;
    return a.usuario.nombre.localeCompare(b.usuario.nombre, 'es');
  }) : [], [details]);
  const confirmParticipant = orderedParticipants.find(participant => participant.usuario.id === confirmUserId);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busyUserId) {
      if (confirmUserId) setConfirmUserId(null);
      else onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!elements.length) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const copyAccessCode = async () => {
    if (!details) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(details.codigoAcceso);
      setCopied(true); setError('');
    } catch {
      setError('No se pudo copiar el código. Selecciónalo y cópialo manualmente.');
    }
  };

  const updatePermission = async (userId: string, permission: ParticipantPermission) => {
    if (!details || busyUserId) return;
    const previous = details;
    setBusyUserId(userId); setError('');
    setDetails({ ...details, participantes: details.participantes.map(participant => participant.usuario.id === userId ? { ...participant, permiso: permission } : participant) });
    try {
      await participantsApi.actualizarPermiso(sessionId, userId, permission);
    } catch (updateError) {
      setDetails(previous);
      setError(getApiErrorMessage(updateError, 'No se pudo cambiar el permiso. Inténtalo otra vez.'));
    } finally { setBusyUserId(null); }
  };

  const removeParticipant = async () => {
    if (!details || !confirmUserId || busyUserId) return;
    const targetId = confirmUserId;
    setBusyUserId(targetId); setError('');
    try {
      await participantsApi.remover(sessionId, targetId);
      setDetails(current => current ? { ...current, participantes: current.participantes.filter(participant => participant.usuario.id !== targetId) } : current);
      setConfirmUserId(null);
    } catch (removeError) {
      setError(getApiErrorMessage(removeError, 'No se pudo remover al colaborador. Puede que ya no pertenezca a la sesión.'));
    } finally { setBusyUserId(null); }
  };

  const title = confirmParticipant ? `Remover a ${confirmParticipant.usuario.nombre}` : 'Colaboradores de la sesión';
  return createPortal(
    <div className="participants-backdrop" role="presentation">
      <div className="participants-dialog" role="dialog" aria-modal="true" aria-labelledby="participants-title" ref={dialogRef} onKeyDown={handleKeyDown}>
        {confirmParticipant ? (
          <div className="participants-confirm-view">
            <div className="participants-confirm-header">
              <div className="participants-confirm-icon" aria-hidden="true"><UserX size={22} /></div>
              <button
                type="button"
                className="participants-close-btn"
                aria-label="Cerrar confirmación"
                onClick={() => setConfirmUserId(null)}
                disabled={Boolean(busyUserId)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <h2 id="participants-title">{title}</h2>
            <p>Perderá el acceso inmediatamente en todas sus pestañas. Para volver tendrá que ser invitado otra vez.</p>
            {error ? <div className="participants-alert" role="alert">{error}</div> : null}
            <div className="participants-confirm-actions">
              <button ref={cancelRemovalRef} type="button" onClick={() => setConfirmUserId(null)} disabled={Boolean(busyUserId)}>Cancelar</button>
              <button className="is-danger" type="button" aria-label="Confirmar remoción" onClick={() => void removeParticipant()} disabled={Boolean(busyUserId)}>
                {busyUserId ? 'Removiendo…' : 'Remover colaborador'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="participants-header">
              <div className="participants-header-text">
                <h2 id="participants-title">{title}</h2>
                <p>Permisos persistentes y presencia en tiempo real.</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="participants-close-btn"
                aria-label="Cerrar colaboradores"
                onClick={onClose}
                disabled={Boolean(busyUserId)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            {error ? (
              <div className="participants-alert" role="alert">
                {error}
                {!details ? <button type="button" onClick={() => setReload(value => value + 1)}>Reintentar</button> : null}
              </div>
            ) : null}
            {loading ? (
              <div className="participants-loading" role="status">
                <span className="participants-loading-skeleton" />
                <span className="participants-loading-skeleton" />
                <span className="participants-loading-skeleton" />
              </div>
            ) : details ? (
              <>
                <section className="participants-code" aria-labelledby="access-code-title">
                  <div>
                    <span id="access-code-title">Código de acceso</span>
                    <strong>{details.codigoAcceso}</strong>
                  </div>
                  <button
                    type="button"
                    className={copied ? 'is-copied' : ''}
                    aria-label="Copiar código de acceso"
                    onClick={() => void copyAccessCode()}
                  >
                    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                    {copied ? 'Código copiado' : 'Copiar'}
                  </button>
                </section>
                <section className="participants-list" aria-labelledby="participant-list-title">
                  <div className="participants-list-heading">
                    <h3 id="participant-list-title">Participantes</h3>
                    <span>{orderedParticipants.length}</span>
                  </div>
                  <div className="participants-scroll-area">
                    {orderedParticipants.map(participant => {
                      const isHost = participant.usuario.id === details.anfitrionId;
                      const live = onlineByUser.get(participant.usuario.id);
                      const displayedPermission = live?.permission ?? participant.permiso;
                      return (
                        <div className="participant-row" key={participant.id}>
                          <span
                            className="participant-avatar"
                            style={{ '--participant-color': live?.color ?? 'var(--color-text-muted)' } as React.CSSProperties}
                          >
                            {participant.usuario.nombre.trim().charAt(0).toLocaleUpperCase()}
                          </span>
                          <div className="participant-identity">
                            <strong>{participant.usuario.nombre}</strong>
                            <span>{participant.usuario.email}</span>
                            <small className={live ? 'is-online' : ''}>{live ? 'En línea' : 'Desconectado'}</small>
                          </div>
                          {isHost ? (
                            <span className="participant-host">
                              <Shield size={14} aria-hidden="true" /> Anfitrión
                            </span>
                          ) : (
                            <label className="participant-permission">
                              <span className="sr-only">Permiso de {participant.usuario.nombre}</span>
                              <span className="participant-permission-icon" aria-hidden="true">
                                {displayedPermission === 'EDICION_COMPLETA' ? <Pencil size={14} /> : <Eye size={14} />}
                              </span>
                              <select
                                aria-label={`Permiso de ${participant.usuario.nombre}`}
                                value={displayedPermission}
                                disabled={Boolean(busyUserId)}
                                onChange={event => void updatePermission(participant.usuario.id, event.target.value as ParticipantPermission)}
                              >
                                <option value="EDICION_COMPLETA">Edición</option>
                                <option value="SOLO_LECTURA">Solo lectura</option>
                              </select>
                            </label>
                          )}
                          {isHost ? (
                            <span className="participant-fixed">Edición completa</span>
                          ) : (
                            <button
                              ref={element => {
                                if (element) removeButtonRefs.current.set(participant.usuario.id, element);
                                else removeButtonRefs.current.delete(participant.usuario.id);
                              }}
                              className="participant-remove"
                              type="button"
                              aria-label={`Remover a ${participant.usuario.nombre}`}
                              onClick={() => {
                                returnFocusUserIdRef.current = participant.usuario.id;
                                setConfirmUserId(participant.usuario.id);
                              }}
                              disabled={Boolean(busyUserId)}
                            >
                              <UserX size={15} aria-hidden="true" />
                              <span>Remover</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
