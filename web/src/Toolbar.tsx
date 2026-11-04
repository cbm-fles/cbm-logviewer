// The controls above the table.

import { fields, severities } from "@cbm-logviewer/shared";
import { type Columns, defaultColumns } from "./columns";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Mode, type RangeId, type View, ranges } from "./filters";

interface Props {
  view: View;
  onView: (change: Partial<View>) => void;
  onMode: (mode: Mode) => void;
  // the number of filters of the columns
  filterCount: number;
  onClearFilters: () => void;
  filtersOpen: boolean;
  onFiltersOpen: (open: boolean) => void;
  onQuery: () => void;
  loading: boolean;
  paused: boolean;
  onPause: (paused: boolean) => void;
  onClear: () => void;
  onDownload: (format: "json" | "csv") => void;
  utc: boolean;
  onUtc: (utc: boolean) => void;
  columns: Columns;
  onColumns: (columns: Columns) => void;
}

export function Toolbar(p: Props) {
  const { view } = p;
  const toggle = (code: number) =>
    p.onView({
      severities: view.severities.includes(code)
        ? view.severities.filter((c) => c !== code)
        : [...view.severities, code].sort((a, b) => a - b),
    });

  return (
    <header className="toolbar">
      <span className="title">CBM Log Viewer</span>

      <div className="segmented" role="group" aria-label="Mode">
        {(["query", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={view.mode === m ? "active" : ""}
            aria-pressed={view.mode === m}
            onClick={() => p.onMode(m)}
          >
            {m === "query" ? "Query" : "Live"}
          </button>
        ))}
      </div>

      {view.mode === "query" && (
        <div className="group">
          <select
            aria-label="Time range"
            value={view.range}
            onChange={(e) => p.onView({ range: e.target.value as RangeId })}
          >
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id === "custom" ? r.label : `Last ${r.label}`}
              </option>
            ))}
          </select>
          {view.range === "custom" && (
            <>
              <input
                type="datetime-local"
                step="1"
                aria-label="From"
                value={view.customFrom}
                onChange={(e) => p.onView({ customFrom: e.target.value })}
              />
              <span className="muted">to</span>
              <input
                type="datetime-local"
                step="1"
                aria-label="To"
                value={view.customTo}
                onChange={(e) => p.onView({ customTo: e.target.value })}
              />
            </>
          )}
        </div>
      )}

      <div className="group severities" role="group" aria-label="Severities">
        {severities.map((s) => (
          <button
            key={s.code}
            type="button"
            className={`sev-toggle sev-${s.text}${view.severities.includes(s.code) ? " on" : ""}`}
            aria-pressed={view.severities.includes(s.code)}
            title={`${s.text} (${s.level})`}
            onClick={() => toggle(s.code)}
          >
            {s.text}
          </button>
        ))}
      </div>

      <div className="group">
        <button
          type="button"
          className="primary"
          title="Apply the filters and the time range as entered"
          onClick={p.onQuery}
          disabled={p.loading}
        >
          {p.loading ? "Applying…" : "Apply"}
        </button>
        {view.mode === "live" && (
          <>
            <button type="button" onClick={() => p.onPause(!p.paused)}>
              {p.paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              title="Remove the messages shown"
              onClick={p.onClear}
            >
              Clear
            </button>
          </>
        )}
      </div>

      <div className="group filters-summary">
        <button
          type="button"
          className={`filters-toggle${p.filterCount > 0 ? " has-filters" : ""}${p.filtersOpen ? " active" : ""}`}
          aria-pressed={p.filtersOpen}
          title={p.filtersOpen ? "Close the filters" : "Show all filters"}
          onClick={() => p.onFiltersOpen(!p.filtersOpen)}
        >
          {p.filterCount === 0
            ? "Filters"
            : `${p.filterCount} ${p.filterCount === 1 ? "filter" : "filters"} active`}
        </button>
        {p.filterCount > 0 && (
          <button
            type="button"
            aria-label={
              p.filterCount === 1 ? "Clear the filter" : "Clear all filters"
            }
            onClick={p.onClearFilters}
          >
            {p.filterCount === 1 ? "Clear" : "Clear all"}
          </button>
        )}
      </div>

      <div className="group end">
        <label className="check">
          <input
            type="checkbox"
            checked={p.utc}
            onChange={(e) => p.onUtc(e.target.checked)}
          />
          UTC
        </label>
        <Menu label="Download">
          {(close) => (
            <>
              {(["json", "csv"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onDownload(format);
                    close();
                  }}
                >
                  {format === "json"
                    ? "JSON, all fields"
                    : "CSV, the visible columns"}
                </button>
              ))}
            </>
          )}
        </Menu>
        <Menu label="Columns">
          {() => (
            <>
              {fields.map((f) => (
                <label
                  key={f.name}
                  className="check"
                  role="menuitemcheckbox"
                  aria-checked={p.columns.visible[f.name] === true}
                >
                  <input
                    type="checkbox"
                    checked={p.columns.visible[f.name] === true}
                    onChange={(e) =>
                      p.onColumns({
                        ...p.columns,
                        visible: {
                          ...p.columns.visible,
                          [f.name]: e.target.checked,
                        },
                      })
                    }
                  />
                  {f.label}
                </label>
              ))}
              <button
                type="button"
                className="reset"
                title="The columns, their order and widths as at first"
                onClick={() => p.onColumns(defaultColumns)}
              >
                Reset columns
              </button>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

function Menu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
