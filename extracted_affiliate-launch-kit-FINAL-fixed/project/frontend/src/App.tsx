import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { ToastProvider } from './components/toast';
import { AppShell } from './components/app-shell';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { NewCampaignPage } from './pages/NewCampaign';
import { EditorPage } from './pages/Editor';
import { ExportPage } from './pages/Export';
import { HistoryPage } from './pages/History';
import { AccountPage } from './pages/Account';
import { Spinner } from './components/ui';

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="auth-wrap"><Spinner /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="auth-wrap"><Spinner /></div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/campaigns/new" element={<Protected><NewCampaignPage /></Protected>} />
            <Route path="/campaigns/:id" element={<Protected><EditorPage /></Protected>} />
            <Route path="/campaigns/:id/export" element={<Protected><ExportPage /></Protected>} />
            <Route path="/history" element={<Protected><HistoryPage /></Protected>} />
            <Route path="/account" element={<Protected><AccountPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
