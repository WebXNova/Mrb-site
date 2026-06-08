import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

function computePanelStyle(triggerEl, panelEl, align) {
  const triggerRect = triggerEl.getBoundingClientRect();
  const panelWidth = panelEl.offsetWidth || 192;
  const panelHeight = panelEl.offsetHeight;
  const minWidth = Math.max(Math.round(triggerRect.width), 192);

  let top = triggerRect.bottom + PANEL_GAP;
  if (top + panelHeight > window.innerHeight - VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, triggerRect.top - panelHeight - PANEL_GAP);
  }

  let left = align === 'right' ? triggerRect.right - panelWidth : triggerRect.left;
  left = Math.min(
    Math.max(left, VIEWPORT_PADDING),
    window.innerWidth - VIEWPORT_PADDING - panelWidth
  );

  return {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: `${minWidth}px`,
    zIndex: 10000,
  };
}

/**
 * Accessible dropdown menu — outside click, ESC, keyboard nav.
 * Panel is portaled with fixed positioning so table scroll areas do not clip it.
 */
export default function AdminActionMenu({
  trigger,
  triggerClassName = 'btn btn--secondary btn--sm',
  triggerLabel = 'More',
  children,
  align = 'right',
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    setPanelStyle(null);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) return;
    setPanelStyle(computePanelStyle(triggerEl, panelEl, align));
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePanelPosition();
    const raf = requestAnimationFrame(updatePanelPosition);
    return () => cancelAnimationFrame(raf);
  }, [open, updatePanelPosition, children]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      const items = panelRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])');
      if (!items?.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(items.length - 1);
      } else if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        items[activeIndex]?.click();
      }
    }

    function onPointerDown(event) {
      if (
        triggerRef.current?.contains(event.target) ||
        panelRef.current?.contains(event.target)
      ) {
        return;
      }
      close();
    }

    function onReposition() {
      updatePanelPosition();
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, activeIndex, updatePanelPosition]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const items = panelRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])');
    items?.[activeIndex]?.focus?.();
  }, [activeIndex, open]);

  const panel = open ? (
    <div
      id={menuId}
      ref={panelRef}
      className="admin-action-menu__panel admin-action-menu__panel--open admin-action-menu__panel--fixed"
      style={panelStyle ?? undefined}
      role="menu"
    >
      {typeof children === 'function' ? children({ close }) : children}
    </div>
  ) : null;

  return (
    <div className={`admin-action-menu admin-action-menu--${align}`}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger ?? triggerLabel}
      </button>

      {typeof document !== 'undefined' && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}

export function AdminActionMenuItem({ children, onClick, className = '', as: Component = 'button', ...rest }) {
  const combined = `admin-action-menu__item ${className}`.trim();

  if (Component === 'button') {
    return (
      <button type="button" className={combined} role="menuitem" onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <Component className={combined} role="menuitem" onClick={onClick} {...rest}>
      {children}
    </Component>
  );
}

export function AdminActionMenuDivider() {
  return <div className="admin-action-menu__divider" role="separator" />;
}

export function AdminActionMenuLabel({ children }) {
  return <span className="admin-action-menu__label">{children}</span>;
}
