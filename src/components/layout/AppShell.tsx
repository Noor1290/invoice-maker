import { NavLink, Link, Outlet } from 'react-router-dom';
import { LayoutDashboard, LayoutTemplate, Package, Plus, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const markUrl = `${import.meta.env.BASE_URL}favicon.svg`;

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="h-[3px] bg-navy" aria-hidden />
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md" aria-label="Invoice Studio, home">
            <img src={markUrl} alt="" className="size-8" />
            <span className="font-serif text-[19px] font-semibold tracking-tight text-navy">
              Invoice <span className="text-gold-700">Studio</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
          <div className="ml-auto md:ml-0">
            <Button asChild size="md">
              <Link to="/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
          </div>
        </div>
        <nav aria-label="Main mobile" className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1.5 md:hidden">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-navy-50 text-navy' : 'text-muted hover:bg-band hover:text-ink',
        )
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </NavLink>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10', className)}>{children}</div>;
}

