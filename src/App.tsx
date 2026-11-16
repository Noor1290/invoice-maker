import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast, Toaster } from 'sonner';
import { generateDueRecurring } from '@/db/recurringRepo';
import { AppShell } from '@/components/layout/AppShell';
import { WelcomeDialog } from '@/features/onboarding/WelcomeDialog';
import { Dashboard } from '@/pages/Dashboard';
import { needsOnboarding } from '@/db/settingsRepo';

// Heavier screens are code-split.
const EditorPage = lazy(() => import('@/features/editor/EditorPage').then((m) => ({ default: m.EditorPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const ClientsPage = lazy(() => import('@/pages/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ProductsPage = lazy(() => import('@/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const RecurringPage = lazy(() => import('@/features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })));
const ReviewPage = lazy(() => import('@/features/recurring/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const GuidePage = lazy(() => import('@/features/guide/GettingStarted').then((m) => ({ default: m.GuidePage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

export function App() {
  // Live: re-evaluates whenever settings or invoices change.
  const showWelcome = useLiveQuery(needsOnboarding, []);

  // Recurring schedules: create due drafts when the app comes back to the foreground, and hourly.
  useEffect(() => {
    const run = () =>
      void generateDueRecurring()
        .then((created) => {
          if (created.length) toast.success(`${created.length} recurring invoice${created.length === 1 ? ' is' : 's are'} ready to review.`);
        })
        .catch((e) => console.error(e));
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(run, 60 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

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
            <Route path="recurring" element={<RecurringPage />} />
            <Route path="recurring/review" element={<ReviewPage />} />
            <Route path="settings/:section?" element={<SettingsPage />} />
            <Route path="guide" element={<GuidePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <WelcomeDialog open={showWelcome === true} />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </HashRouter>
  );
}
