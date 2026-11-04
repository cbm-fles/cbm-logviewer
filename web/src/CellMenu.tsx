// The menu of a cell, on a right click: filter on its value or copy it.

import { useEffect, useRef } from "react";

export interface CellMenuState {
  x: number;
  y: number;
  field: string;
  label: string;
  value: string;
  // whether the field can be filtered
  filter: boolean;
}

interface Props {
  menu: CellMenuState;
  onFilter: (field: string, value: string, kind: "match" | "exclude") => void;
  onClose: () => void;
}

// the width of the menu, see .cell-menu
const menuWidth = 260;

export function CellMenu({ menu, onFilter, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", close);
    // not on scroll, as the table scrolls by itself in live mode
    document.addEventListener("wheel", close, true);
    document.addEventListener("keydown", key);
    ref.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("wheel", close, true);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const item = (label: string, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      onClick={() => {
        action();
        onClose();
      }}
    >
      {label}
    </button>
  );

  // inside the window
  const style = {
    left: Math.max(0, Math.min(menu.x, window.innerWidth - menuWidth - 8)),
    top: Math.max(0, Math.min(menu.y, window.innerHeight - 120)),
  };

  return (
    <div
      className="menu-list cell-menu"
      role="menu"
      aria-label={`${menu.label}: ${menu.value}`}
      ref={ref}
      style={style}
    >
      <div className="cell-menu-head" title={menu.value}>
        <span className="muted">{menu.label}:</span> {menu.value || "(empty)"}
      </div>
      {menu.filter && (
        <>
          {item("Match this value", () =>
            onFilter(menu.field, menu.value, "match"),
          )}
          {item("Exclude this value", () =>
            onFilter(menu.field, menu.value, "exclude"),
          )}
        </>
      )}
      {item("Copy value", () => {
        void navigator.clipboard?.writeText(menu.value).catch(() => undefined);
      })}
    </div>
  );
}
