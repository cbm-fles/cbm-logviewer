// All filters of the columns in one place, including those of hidden columns.

import { fields } from "@cbm-logviewer/shared";
import type { Columns } from "./columns";
import { type FieldInput, type FieldInputs, isFilterField } from "./filters";

interface Props {
  filters: FieldInputs;
  columns: Columns;
  onFilter: (field: string, input: FieldInput) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function FilterPanel(p: Props) {
  const filterable = fields.filter((f) => isFilterField(f.name));
  const input = (field: string, kind: keyof FieldInput) => {
    const value = p.filters[field as keyof FieldInputs] ?? {
      match: "",
      exclude: "",
    };
    const label = fields.find((f) => f.name === field)?.label ?? field;
    return (
      <input
        className={`filter ${kind}`}
        aria-label={`${kind === "match" ? "Match" : "Exclude"} ${label} in all filters`}
        placeholder={kind}
        value={value[kind]}
        onChange={(e) =>
          p.onFilter(field, { ...value, [kind]: e.target.value })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") p.onApply();
        }}
      />
    );
  };

  return (
    <section className="filter-panel" aria-label="Filters">
      <div className="panel-head">
        <span className="title">Filters</span>
        <button type="button" onClick={p.onApply}>
          Apply
        </button>
        <button type="button" onClick={p.onClear}>
          Clear all
        </button>
        <button type="button" aria-label="Close filters" onClick={p.onClose}>
          ×
        </button>
      </div>
      <div className="filter-grid">
        <span />
        <span className="muted">match</span>
        <span className="muted">exclude</span>
        {filterable.map((f) => (
          <div key={f.name} className="filter-row">
            <span>
              {f.label}
              {p.columns.visible[f.name] !== true && (
                <span className="muted hidden-note"> (hidden)</span>
              )}
            </span>
            {input(f.name, "match")}
            {input(f.name, "exclude")}
          </div>
        ))}
      </div>
      <p className="syntax muted">
        Patterns are separated by commas, one of them must match. <code>*</code>{" "}
        and <code>?</code> are wildcards, <code>\*</code> and <code>\?</code>{" "}
        stand for themselves, <code>"a, b"</code> keeps a comma. In Message and
        Data, a pattern is a phrase. Enter or Apply applies them.
      </p>
    </section>
  );
}
