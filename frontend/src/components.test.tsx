import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// API-ul și sesiunea sunt simulate: testele verifică ce afișează paginile, nu serverul.
const apiMock = vi.fn();
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), api: (...a: unknown[]) => apiMock(...a) }));
let currentUser: { id: string; name: string; role: 'ORGANIZER' | 'PARTICIPANT' } | null = null;
vi.mock('./auth', () => ({ useAuth: () => ({ user: currentUser, ready: true }) }));
const toDataURL = vi.fn(async (..._a: unknown[]) => 'data:image/png;base64,AAAA');
vi.mock('qrcode', () => ({ default: { toDataURL: (...a: unknown[]) => toDataURL(...a) } }));

import CheckInPage from './pages/CheckInPage';
import TicketCard from './TicketCard';
import ErrorBoundary from './ErrorBoundary';

afterEach(() => { cleanup(); apiMock.mockReset(); currentUser = null; });

const checkIn = (path: string) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/check-in/:code" element={<CheckInPage />} /></Routes>
      </MemoryRouter>
    </StrictMode>,
  );

describe('Validarea la intrare', () => {
  it('organizator: biletul scanat se validează imediat, o singură cerere (și în StrictMode)', async () => {
    currentUser = { id: 'o1', name: 'Maria', role: 'ORGANIZER' };
    apiMock.mockResolvedValue({ result: 'CHECKED_IN', checkedInAt: '2026-11-06T18:04:00Z', ticket: '7KQ2M-9XH4T', participant: { name: 'Ana Pop' }, event: { id: 'e1', title: 'Concert' } });
    checkIn('/check-in/7KQ2M9XH4T');
    expect(await screen.findByText('Bilet valid')).toBeTruthy();
    expect(screen.getByText('Ana Pop')).toBeTruthy();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith('/check-in', { method: 'POST', body: { code: '7KQ2M9XH4T' } });
  });

  it('deja validat: arată ora primei validări', async () => {
    currentUser = { id: 'o1', name: 'Maria', role: 'ORGANIZER' };
    apiMock.mockResolvedValue({ result: 'ALREADY_CHECKED_IN', checkedInAt: '2026-11-06T18:04:00Z', ticket: 'X', participant: { name: 'Ana' }, event: { id: 'e1', title: 'Concert' } });
    checkIn('/check-in/7KQ2M9XH4T');
    expect(await screen.findByText(/^Deja validat la \d{2}:\d{2}$/)).toBeTruthy();
  });

  it('cod respins de server: „Nu intră” cu motivul', async () => {
    currentUser = { id: 'o1', name: 'Maria', role: 'ORGANIZER' };
    apiMock.mockRejectedValue(new Error('Bilet necunoscut pentru evenimentele tale.'));
    checkIn('/check-in/0000000000');
    expect(await screen.findByText('Nu intră')).toBeTruthy();
    expect(screen.getByText('Bilet necunoscut pentru evenimentele tale.')).toBeTruthy();
  });

  it('participantul care își scanează biletul nu trimite nimic; vizitatorul e trimis la autentificare cu întoarcere', () => {
    currentUser = { id: 'p1', name: 'Ana', role: 'PARTICIPANT' };
    checkIn('/check-in/7KQ2M9XH4T');
    expect(screen.getByText('Acesta este un bilet')).toBeTruthy();
    cleanup();
    currentUser = null;
    checkIn('/check-in/7KQ2M9XH4T');
    expect(screen.getByRole('link', { name: /Autentifică-te ca organizator/ }).getAttribute('href')).toBe('/login?next=%2Fcheck-in%2F7KQ2M9XH4T');
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('Biletul', () => {
  it('QR-ul conține linkul de validare al acestui bilet; codul e afișat cu cratimă', async () => {
    render(<TicketCard ticket={{ code: '7KQ2M9XH4T', display: '7KQ2M-9XH4T', checkedInAt: null }} title="Concert" />);
    expect(await screen.findByAltText('Cod QR pentru biletul 7KQ2M-9XH4T')).toBeTruthy();
    expect(toDataURL.mock.calls[0][0]).toBe(`${window.location.origin}/check-in/7KQ2M9XH4T`);
    expect(screen.getByText('7KQ2M-9XH4T')).toBeTruthy();
  });

  it('validat: arată când', async () => {
    render(<TicketCard ticket={{ code: 'A', display: 'A', checkedInAt: '2026-11-06T18:04:00Z' }} title="Concert" />);
    expect(screen.getByText(/^Validat la intrare/)).toBeTruthy();
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
  });
});

describe('ErrorBoundary', () => {
  it('o eroare de afișare nu lasă pagina albă', () => {
    const Boom = () => { throw new Error('boom'); };
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React scrie eroarea în consolă
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Ceva nu a mers')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reîncarcă pagina' })).toBeTruthy();
  });
});

describe('Butonul de temă', () => {
  it('comută întunecat ↔ deschis pe <html>, ține minte alegerea și își schimbă eticheta', async () => {
    const { default: ThemeToggle } = await import('./ThemeToggle');
    const { fireEvent } = await import('@testing-library/react');
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Treci la tema deschisă' });
    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('eventhub-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Treci la tema întunecată' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('eventhub-theme')).toBe('dark');
  });
});
