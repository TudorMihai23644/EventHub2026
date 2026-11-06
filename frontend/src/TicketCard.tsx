import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { EventItem } from './types';

/**
 * Biletul participantului: QR cu linkul de validare (/check-in/COD). QR-ul se generează în browser,
 * deci codul nu pleacă spre niciun serviciu extern. Negru pe alb, cu margine: se citește și pe ecran întunecat.
 */
export default function TicketCard({ ticket, title }: { ticket: NonNullable<EventItem['ticket']>; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`${window.location.origin}/check-in/${ticket.code}`, { errorCorrectionLevel: 'M', margin: 2, width: 480, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [ticket.code]);

  return (
    <div className="ticket">
      <div className="ticket-qr">
        {src ? <img src={src} alt={`Cod QR pentru biletul ${ticket.display}`} width={240} height={240} /> : <div className="qr-placeholder" />}
      </div>
      <div className="ticket-info">
        <p className="small tag">Biletul tău</p>
        <strong className="ticket-title">{title}</strong>
        <p className="ticket-code">{ticket.display}</p>
        {ticket.checkedInAt
          ? <p className="ok-text">Validat la intrare, {new Date(ticket.checkedInAt).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
          : <p className="muted small">Arată codul la intrare. Îl găsești și în emailul de confirmare.</p>}
      </div>
    </div>
  );
}
