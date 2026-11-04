// The menu of a cell, on a right click: filter on its value, clear the filter
// of its column, copy the value or show the message in the inspector.

import { useEffect, useRef } from "react";
import { type IconName, Icon } from "./icons";

export interface CellMenuState {
  x: number;
  y: number;
  // the message
  id: string;
  field: string;
  label: string;
  value: string;
  // whether the field can be filtered, and on this value
  filterable: boolean;
  hasValue: boolean;
  // whether the column has a filter
  hasFilter: boolean;
}

interface Props {
  menu: CellMenuState;
  onFilter: (field: string, value: string, kind: "match" | "exclude") => void;
  onClearFilter: (field: string) => void;
  onInspect: (id: string) => void;
  onClose: () => void;
}

// the width of the menu, see .cell-menu
const menuWidth = 240;

export function CellMenu({
  menu,
  onFilter,
  onClearFilter,
  onInspect,
  onClose,
}: Props) {
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
    ref.current?.querySelector<HTMLButtonElement>("button:enabled")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("wheel", close, true);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const item = (
    icon: IconName,
    label: string,
    action: () => void,
    enabled = true,
  ) => (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={!enabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  // inside the window
  const style = {
    left: Math.max(0, Math.min(menu.x, window.innerWidth - menuWidth - 8)),
    top: Math.max(0, Math.min(menu.y, window.innerHeight - 260)),
  };

  return (
    <div
      className="menu-list cell-menu"
      role="menu"
      aria-label={`${menu.label}: ${menu.value}`}
      ref={ref}
      style={style}
    >
      <div className="cell-menu-head">
        <div className="cell-menu-label">{menu.label}</div>
        <div className="cell-menu-value" title={menu.value}>
          {menu.value || "(empty)"}
        </div>
      </div>
      {menu.filterable && (
        <>
          {item(
            "match",
            "Match",
            () => onFilter(menu.field, menu.value, "match"),
            menu.hasValue,
          )}
          {item(
            "exclude",
            "Exclude",
            () => onFilter(menu.field, menu.value, "exclude"),
            menu.hasValue,
          )}
          {item(
            "clear",
            "Clear filter",
            () => onClearFilter(menu.field),
            menu.hasFilter,
          )}
        </>
      )}
      {item("copy", "Copy", () => {
        void navigator.clipboard?.writeText(menu.value).catch(() => undefined);
      })}
      {item("inspect", "Inspect", () => onInspect(menu.id))}
    </div>
  );
}
