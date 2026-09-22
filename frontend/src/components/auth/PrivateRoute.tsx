import { Navigate } from 'react-router-dom';
import { getStoredSession } from '../../services/authStorage';

interface PrivateRouteProps {
  children: React.ReactNode;
}

/**
 * Protects routes for any authenticated user.
 * Redirects to /login if no session token is found.
 */
const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const session = getStoredSession();
  if (!session) return <Navigate to="/login" replace />;
  return children;
};

export default PrivateRoute;
