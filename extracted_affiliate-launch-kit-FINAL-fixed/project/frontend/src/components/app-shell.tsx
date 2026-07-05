import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui';

/**
 * Global Navigation Shell (Section 2.0): persistent sidebar with Logo,
 * Dashboard, New Campaign, Campaign History, Account/License, Logout.
 * Collapses to a slide-in drawer under 768px (Section 7.3).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: '/campaigns/new', label: 'New Campaign', icon: '✨' },
    { to: '/history', label: 'Campaign History', icon: '🗂️' },
    { to: '/account', label: 'Account / License', icon: '🔑' },
  ];

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const close = () => setOpen(false);

  return (
    <div className="app-shell">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={close} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="logo">🚀 LaunchKit</div>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={close}
          >
            <span>{l.icon}</span> {l.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <Button variant="ghost" onClick={doLogout} style={{ justifyContent: 'flex-start' }}>
          🚪 Logout
        </Button>
      </aside>
      <main className="main">
        <Button
          className="menu-toggle"
          variant="secondary"
          compact
          onClick={() => setOpen(true)}
          style={{ marginBottom: 'var(--space-4)' }}
          aria-label="Open menu"
        >
          ☰ Menu
        </Button>
        {children}
      </main>
    </div>
  );
}
