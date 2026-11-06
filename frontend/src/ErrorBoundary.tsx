import { Component, ReactNode } from 'react';
import { reportError } from './monitoring';

/** O eroare de afișare nu lasă pagina albă: mesaj, buton de reîncărcare, raport la Sentry (dacă e configurat). */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main>
        <div className="form">
          <h1>Ceva nu a mers</h1>
          <p>Pagina a întâmpinat o eroare neașteptată. Reîncarcă pagina; dacă se repetă, revino puțin mai târziu.</p>
          <button className="btn" onClick={() => window.location.reload()}>Reîncarcă pagina</button>
        </div>
      </main>
    );
  }
}
