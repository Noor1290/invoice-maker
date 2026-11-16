import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { WelcomeDialog } from '@/features/onboarding/WelcomeDialog';
import { Dashboard } from '@/pages/Dashboard';
import { ComingSoon } from '@/pages/ComingSoon';
import { needsOnboarding } from '@/db/settingsRepo';

// Heavier screens are code-split.
const EditorPage = lazy(() => import('@/features/editor/EditorPage').then((m) => ({ default: m.EditorPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

export function App() {
  // Live: re-evaluates whenever settings or invoices change.
  const showWelcome = useLiveQuery(needsOnboarding, []);

  return (
    // HashRouter: URLs like /#/invoices/123 so refreshing never hits a GitHub Pages 404.
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="invoices/:id" element={<EditorPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="clients" element={<ComingSoon title="Clients" phase={4} />} />
            <Route path="products" element={<ComingSoon title="Products & services" phase={4} />} />
            <Route path="settings/:section?" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <WelcomeDialog open={showWelcome === true} />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </HashRouter>
  );
}
