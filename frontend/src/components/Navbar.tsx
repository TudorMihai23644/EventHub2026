import { Link, useLocation } from 'react-router-dom';

interface NavbarProps {
  isAuthenticated?: boolean;
  userRole?: string;
  onLogout?: () => void;
}

export function Navbar({ isAuthenticated, userRole, onLogout }: NavbarProps) {
  const location = useLocation();

  return (
    <header className="neon-navbar">
      <div className="container-4k navbar-inner">
        <Link to="/" className="brand-logo">
          EVENT<span>HUB</span>
        </Link>

        <nav className="nav-links">
          <Link
            to="/"
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          >
            Evenimente
          </Link>

          {isAuthenticated && (
            <Link
              to="/my-registrations"
              className={`nav-link ${location.pathname === '/my-registrations' ? 'active' : ''}`}
            >
              Înscrierile Mele
            </Link>
          )}

          {userRole === 'ADMIN' && (
            <Link
              to="/admin/events"
              className={`nav-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
            >
              Panou Admin
            </Link>
          )}

          {!isAuthenticated ? (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/login" className="btn-neon btn-neon-outline">
                Autentificare
              </Link>
              <Link to="/register" className="btn-neon">
                Înregistrare
              </Link>
            </div>
          ) : (
            <button onClick={onLogout} className="btn-neon btn-neon-outline">
              Deconectare
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
