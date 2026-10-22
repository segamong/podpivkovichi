import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, X } from 'lucide-react';
import './call-layout.css';

export default function CallSettingsDrawer({ id, open, triggerRef, onClose, actions, children }: {
  id: string;
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      if (path.includes(panelRef.current as EventTarget) || path.includes(triggerRef.current as EventTarget)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onClose, triggerRef]);

  return createPortal(<aside ref={panelRef} id={id}
    className={`call-settings call-settings-drawer${open ? ' is-open' : ''}`}
    role="dialog" aria-modal={false} aria-labelledby={`${id}-title`}
    aria-hidden={!open} inert={!open} tabIndex={-1}>
    <header className="call-settings-drawer-heading"><h3 id={`${id}-title`}><Settings2 size={18}/>Голос и видео</h3>
      <button className="icon-btn" type="button" aria-label="Закрыть настройки звонка" onClick={() => { onClose(); triggerRef.current?.focus({ preventScroll: true }); }}><X size={20}/></button>
    </header>
    <div className="call-settings-drawer-scroll">{actions && <div className="call-settings-drawer-actions">{actions}</div>}{children}</div>
  </aside>, document.body);
}
