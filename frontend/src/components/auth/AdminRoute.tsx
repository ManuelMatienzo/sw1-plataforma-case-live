import { Navigate } from 'react-router-dom';
import { getStoredSession } from '../../services/authStorage';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const session = getStoredSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.rol !== 'ADMINISTRADOR') return <Navigate to="/app" replace />;
  return children;
};

export default AdminRoute;

