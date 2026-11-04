// The controls above the table.

import { fields, severities } from "@cbm-logviewer/shared";
import type { VisibilityState } from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";

export type Mode = "query" | "live";

export const ranges = [
  { id: "15m", label: "15 min", from: "now-15m" },
  { id: "1h", label: "1 hour", from: "now-1h" },
  { id: "6h", label: "6 hours", from: "now-6h" },
  { id: "24h", label: "24 hours", from: "now-24h" },
  { id: "7d", label: "7 days", from: "now-7d" },
  { id: "custom", label: "Custom", from: undefined },
] as const;

export type RangeId = (typeof ranges)[number]["id"];

export const limits = [1000, 10000, 100000];

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  range: RangeId;
  onRange: (range: RangeId) => void;
  customFrom: string;
  customTo: string;
  onCustom: (from: string, to: string) => void;
  selected: number[];
  onSelected: (codes: number[]) => void;
  limit: number;
  onLimit: (limit: number) => void;
  onQuery: () => void;
  loading: boolean;
  paused: boolean;
  onPause: (paused: boolean) => void;
  onClear: () => void;
  utc: boolean;
  onUtc: (utc: boolean) => void;
  columnVisibility: VisibilityState;
  onColumnVisibility: (v: VisibilityState) => void;
}

export function Toolbar(p: Props) {
  const toggle = (code: number) =>
    p.onSelected(
      p.selected.includes(code)
        ? p.selected.filter((c) => c !== code)
        : [...p.selected, code].sort((a, b) => a - b),
    );

  return (
    <header className="toolbar">
      <span className="title">CBM Log Viewer</span>

      <div className="segmented" role="group" aria-label="Mode">
        {(["query", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={p.mode === m ? "active" : ""}
            aria-pressed={p.mode === m}
            onClick={() => p.onMode(m)}
          >
            {m === "query" ? "Query" : "Live"}
          </button>
        ))}
      </div>

      {p.mode === "query" && (
        <div className="group">
          <select
            aria-label="Time range"
            value={p.range}
            onChange={(e) => p.onRange(e.target.value as RangeId)}
          >
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id === "custom" ? r.label : `Last ${r.label}`}
              </option>
            ))}
          </select>
          {p.range === "custom" && (
            <>
              <input
                type="datetime-local"
                step="1"
                aria-label="From"
                value={p.customFrom}
                onChange={(e) => p.onCustom(e.target.value, p.customTo)}
              />
              <span className="muted">to</span>
              <input
                type="datetime-local"
                step="1"
                aria-label="To"
                value={p.customTo}
                onChange={(e) => p.onCustom(p.customFrom, e.target.value)}
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
            className={`sev-toggle sev-${s.text}${p.selected.includes(s.code) ? " on" : ""}`}
            aria-pressed={p.selected.includes(s.code)}
            title={`${s.text} (${s.level})`}
            onClick={() => toggle(s.code)}
          >
            {s.text}
          </button>
        ))}
      </div>

      <div className="group">
        <select
          aria-label={p.mode === "query" ? "Maximum messages" : "Messages kept"}
          value={p.limit}
          onChange={(e) => p.onLimit(Number(e.target.value))}
        >
          {limits.map((l) => (
            <option key={l} value={l}>
              {l.toLocaleString("en")} messages
            </option>
          ))}
        </select>
        {p.mode === "query" ? (
          <button
            type="button"
            className="primary"
            onClick={p.onQuery}
            disabled={p.loading}
          >
            {p.loading ? "Running…" : "Run"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="primary"
              onClick={() => p.onPause(!p.paused)}
            >
              {p.paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={p.onClear}>
              Clear
            </button>
          </>
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
        <ColumnMenu
          visibility={p.columnVisibility}
          onChange={p.onColumnVisibility}
        />
      </div>
    </header>
  );
}

function ColumnMenu({
  visibility,
  onChange,
}: {
  visibility: VisibilityState;
  onChange: (v: VisibilityState) => void;
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
        Columns
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {fields.map((f) => (
            <label
              key={f.name}
              className="check"
              role="menuitemcheckbox"
              aria-checked={visibility[f.name] !== false}
            >
              <input
                type="checkbox"
                checked={visibility[f.name] !== false}
                onChange={(e) =>
                  onChange({ ...visibility, [f.name]: e.target.checked })
                }
              />
              {f.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
