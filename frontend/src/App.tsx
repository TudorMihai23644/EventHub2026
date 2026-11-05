import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { RequireRole, useAuth } from './auth';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import MyRegistrationsPage from './pages/MyRegistrationsPage';
import DashboardPage from './pages/DashboardPage';
import EventFormPage from './pages/EventFormPage';
import { useToast } from './ui';

// Sigla EventHub, redesenată vectorial (rămâne clară la orice rezoluție, inclusiv 4K).
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 153 140" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d="M0 0h153v9H0z M0 18h153v18H0z M0 45h18v95H0z M27 45h18v95H27z M54 45h45v45H54z M69 60h15v15H69z M54 99h18v41H54z M81 99h18v41H81z M108 45h18v95H108z M135 45h18v95H135z" />
    </svg>
  );
}

function Navbar() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  return (
    <header className="bar">
      <div className="bar-in">
        <Link to="/" className="logo"><LogoMark />EventHub</Link>
        <nav>
          <NavLink to="/">Evenimente</NavLink>
          {user?.role === 'PARTICIPANT' && <NavLink to="/inscrierile-mele">Înscrierile mele</NavLink>}
          {user?.role === 'ORGANIZER' && <NavLink to="/organizator">Evenimentele mele</NavLink>}
          {user ? (
            <>
              <span className="who">{user.name}</span>
              <button className="link" onClick={() => { logout(); notify('ok', 'Te-ai deconectat.'); nav('/'); }}>
                Deconectare
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Autentificare</NavLink>
              <NavLink to="/register" className="cta">Creează cont</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/inscrierile-mele" element={<RequireRole role="PARTICIPANT"><MyRegistrationsPage /></RequireRole>} />
          <Route path="/organizator" element={<RequireRole role="ORGANIZER"><DashboardPage /></RequireRole>} />
          <Route path="/organizator/nou" element={<RequireRole role="ORGANIZER"><EventFormPage /></RequireRole>} />
          <Route path="/organizator/:id/editare" element={<RequireRole role="ORGANIZER"><EventFormPage /></RequireRole>} />
          <Route path="*" element={<p>Pagina nu există. <Link to="/">Înapoi la evenimente</Link></p>} />
        </Routes>
      </main>
    </>
  );
}
