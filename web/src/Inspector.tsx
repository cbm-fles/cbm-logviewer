// All fields of the selected message, beside the table.

import { type LogMessage, fields } from "@cbm-logviewer/shared";
import { useState } from "react";
import { isFilterField } from "./filters";
import { formatTime, formatValue } from "./format";

interface Props {
  message: LogMessage;
  utc: boolean;
  onFilter: (field: string, value: string, kind: "match" | "exclude") => void;
  onClose: () => void;
}

export function Inspector({ message, utc, onFilter, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const record = message as unknown as Record<string, unknown>;
  const known = new Set<string>([
    "id",
    "severity_code",
    ...fields.map((f) => f.name),
  ]);
  // fields that the viewer does not know, e.g. added by Fluent Bit
  const others = Object.keys(record).filter((k) => !known.has(k));

  const copy = () => {
    navigator.clipboard
      ?.writeText(JSON.stringify(message, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  const row = (name: string, label: string) => {
    const value = record[name];
    if (value === undefined || value === null || name === "data") return null;
    const text =
      name === "@timestamp"
        ? `${formatTime(message["@timestamp"], utc)} (${message["@timestamp"]})`
        : formatValue(value);
    const shown =
      name === "severity_text" ? `${text} (${message.severity_code})` : text;
    return (
      <div key={name} className="field">
        <dt>{label}</dt>
        <dd className={name === "severity_text" ? `sev-${text}` : undefined}>
          {shown}
        </dd>
        {isFilterField(name) && (
          <span className="field-actions">
            <button
              type="button"
              title={`Match this ${label}`}
              aria-label={`Match this ${label}`}
              onClick={() => onFilter(name, formatValue(value), "match")}
            >
              +
            </button>
            <button
              type="button"
              title={`Exclude this ${label}`}
              aria-label={`Exclude this ${label}`}
              onClick={() => onFilter(name, formatValue(value), "exclude")}
            >
              −
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <aside className="inspector" aria-label="Message">
      <div className="inspector-head">
        <span className="title">Message</span>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy JSON"}
        </button>
        <button type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <dl>
        {fields.map((f) => row(f.name, f.label))}
        {others.map((k) => row(k, k))}
      </dl>
      {message.data !== undefined && (
        <>
          <div className="data-label">Data</div>
          <pre className="data">{JSON.stringify(message.data, null, 2)}</pre>
        </>
      )}
    </aside>
  );
}
