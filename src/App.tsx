import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { WelcomeDialog } from '@/features/onboarding/WelcomeDialog';
import { Dashboard } from '@/pages/Dashboard';
import { needsOnboarding } from '@/db/settingsRepo';

// Heavier screens are code-split.
const EditorPage = lazy(() => import('@/features/editor/EditorPage').then((m) => ({ default: m.EditorPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const ClientsPage = lazy(() => import('@/pages/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ProductsPage = lazy(() => import('@/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
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
            <Route path="clients" element={<ClientsPage />} />
            <Route path="products" element={<ProductsPage />} />
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
