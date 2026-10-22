import type { ReactNode } from 'react';
import './call-layout.css';

export default function CallMediaLayout({ screen, screenSwitcher, participants }: {
  screen?: ReactNode;
  screenSwitcher?: ReactNode;
  participants: ReactNode;
}) {
  if (!screen) return <div className="participant-grid">{participants}</div>;
  return <div className="call-media-layout">
    <div className="call-screen-main">{screen}</div>
    <aside className="call-screen-rail" aria-label="Экраны и участники звонка">
      {screenSwitcher}
      <div className="participant-grid thumbnails">{participants}</div>
    </aside>
  </div>;
}
