import { Navigate, Route, Routes } from 'react-router-dom';
import AdminRoute from './components/auth/AdminRoute';
import PrivateRoute from './components/auth/PrivateRoute';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import WorkspaceDemoPage from './pages/WorkspaceDemoPage';

const App = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route
      path="/admin"
      element={
        <AdminRoute>
          <AdminPage />
        </AdminRoute>
      }
    />
    <Route
      path="/dashboard"
      element={
        <PrivateRoute>
          <DashboardPage />
        </PrivateRoute>
      }
    />
    <Route
      path="/sesion/:sesionId"
      element={
        <PrivateRoute>
          <WorkspaceDemoPage />
        </PrivateRoute>
      }
    />
    <Route path="/app" element={<WorkspaceDemoPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
