import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout, RequireAuth } from './layouts/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewMigrationPage } from './pages/NewMigrationPage';
import { HistoryPage } from './pages/HistoryPage';
import { AccountsPage } from './pages/AccountsPage';
import { MigrationDetailPage } from './pages/MigrationDetailPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — wrapped in sidebar layout */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <AppLayout>
                  <DashboardPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/migrations/new"
            element={
              <RequireAuth>
                <AppLayout>
                  <NewMigrationPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth>
                <AppLayout>
                  <HistoryPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/migrations/:jobId"
            element={
              <RequireAuth>
                <AppLayout>
                  <MigrationDetailPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/accounts"
            element={
              <RequireAuth>
                <AppLayout>
                  <AccountsPage />
                </AppLayout>
              </RequireAuth>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
