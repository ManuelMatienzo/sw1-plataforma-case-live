import { Wifi, WifiOff } from 'lucide-react';
import type { PresenceUser } from '../../types/realtime';
import type { RealtimeStatus } from '../../services/umlSocketClient';

interface Props { users: PresenceUser[]; status: RealtimeStatus }
export default function SessionPresenceBar({ users, status }: Props) {
  const label = status === 'online' ? `${users.length} en línea` : status === 'connecting' ? 'Conectando…' : 'Sin conexión en vivo';
  return <div className={`uml-presence is-${status}`} role="group" aria-label="Participantes en línea">
    <span className="uml-presence-status" role="status" title={label}>
      {status === 'online' ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
      <span>{label}</span>
    </span>
    {users.slice(0, 5).map(user => <span className="uml-presence-person" key={user.socketId}
      title={`${user.name} · ${user.role === 'ANFITRION' ? 'Anfitrión' : user.canEdit ? 'Edición' : 'Solo lectura'}`}>
      <span className="uml-presence-avatar" style={{ '--presence-color': user.color } as React.CSSProperties}>{user.name.trim().charAt(0).toLocaleUpperCase()}</span>
      <span className="uml-presence-name">{user.name}</span>
      {!user.canEdit ? <span className="sr-only"> · Solo lectura</span> : null}
    </span>)}
    {users.length > 5 ? <span className="uml-presence-more" title={`${users.length - 5} participantes adicionales`}>+{users.length - 5}</span> : null}
  </div>;
}
