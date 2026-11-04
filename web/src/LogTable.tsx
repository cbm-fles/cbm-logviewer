// The table of messages: one line per message, virtualized, so that it stays
// fast with 100000 messages.

import { type LogMessage, fields } from "@cbm-logviewer/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Columns,
  flexColumn,
  minWidth,
  move,
  shown,
  width,
} from "./columns";
import { type FieldInput, type FieldInputs, isFilterField } from "./filters";
import { formatTime, formatValue, localZone } from "./format";

export const rowHeight = 20;

const labels = Object.fromEntries(fields.map((f) => [f.name, f.label]));

export function cellText(m: LogMessage, field: string, utc: boolean): string {
  if (field === "@timestamp") return formatTime(m["@timestamp"], utc);
  return formatValue((m as unknown as Record<string, unknown>)[field]);
}

interface Props {
  messages: LogMessage[];
  utc: boolean;
  columns: Columns;
  onColumns: (change: (c: Columns) => Columns) => void;
  // The newest messages stay in view while it is scrolled to the end. It
  // shows the end, the newest messages, whenever it changes, e.g. per query
  resetKey: unknown;
  filters: FieldInputs;
  onFilter: (field: string, input: FieldInput) => void;
  // Enter in a filter
  onApply: () => void;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  onCellMenu: (e: MouseEvent, m: LogMessage, field: string) => void;
}

export function LogTable(p: Props) {
  const { messages, utc, columns, onColumns } = p;
  const visible = shown(columns);
  const isFlex = (id: string) =>
    id === flexColumn && columns.widths[id] === undefined;
  const style = (id: string) =>
    isFlex(id)
      ? { flex: `1 0 ${width(columns, id)}px` }
      : { width: width(columns, id), flex: "none" };
  const totalWidth = visible.reduce((w, id) => w + width(columns, id), 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  });

  // whether the view is at the end, before new messages arrive
  const atEnd = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      atEnd.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < rowHeight * 2;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    atEnd.current = true;
  }, [p.resetKey]);
  // after the messages changed, also when old ones were dropped for new ones
  useLayoutEffect(() => {
    if (atEnd.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages, virtualizer]);

  // Resizing starts from the width on the screen, which for Message can be
  // more than its width.
  const [resizing, setResizing] = useState<string>();
  const startResize = (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const header = (e.target as HTMLElement).parentElement!;
    const startX = e.clientX;
    const startWidth = header.getBoundingClientRect().width;
    setResizing(id);
    const onMove = (ev: globalThis.MouseEvent) => {
      const w = Math.max(
        minWidth,
        Math.round(startWidth + ev.clientX - startX),
      );
      onColumns((c) => ({ ...c, widths: { ...c.widths, [id]: w } }));
    };
    const onUp = () => {
      setResizing(undefined);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const resetWidth = (id: string) =>
    onColumns((c) => {
      const { [id]: _, ...widths } = c.widths;
      return { ...c, widths };
    });

  // a header dragged onto another one moves before it, or after it in its
  // right half
  const [dragged, setDragged] = useState<string>();
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean }>();
  const onDragOver = (e: DragEvent, id: string) => {
    if (dragged === undefined) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    if (dropAt?.id !== id || dropAt.after !== after) setDropAt({ id, after });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragged !== undefined && dropAt) {
      const target = visible.indexOf(dropAt.id);
      const before = dropAt.after ? visible[target + 1] : dropAt.id;
      // before the next shown column, so hidden ones keep their place
      onColumns((c) => ({ ...c, order: move(c.order, dragged, before) }));
    }
    setDragged(undefined);
    setDropAt(undefined);
  };

  // the arrow keys, page keys, Home and End move the selection
  const onKeyDown = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).tagName === "INPUT" ||
      messages.length === 0
    ) {
      return;
    }
    const page = Math.max(
      1,
      Math.floor((scrollRef.current?.clientHeight ?? 0) / rowHeight) - 2,
    );
    const current = p.selected
      ? messages.findIndex((m) => m.id === p.selected)
      : -1;
    const from = current >= 0 ? current : messages.length;
    const steps: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: page,
      PageUp: -page,
      Home: -messages.length,
      End: messages.length,
    };
    if (e.key === "Escape") {
      p.onSelect(undefined);
      return;
    }
    const step = steps[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = Math.min(messages.length - 1, Math.max(0, from + step));
    p.onSelect(messages[next]!.id);
    virtualizer.scrollToIndex(next);
  };

  const filterInput = (field: string, kind: keyof FieldInput) => {
    if (!isFilterField(field)) return null;
    const input = p.filters[field] ?? { match: "", exclude: "" };
    return (
      <input
        className={`filter ${kind}`}
        aria-label={`${kind === "match" ? "Match" : "Exclude"} ${field}`}
        placeholder={kind === "match" ? "match" : "exclude"}
        value={input[kind]}
        onChange={(e) =>
          p.onFilter(field, { ...input, [kind]: e.target.value })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") p.onApply();
        }}
      />
    );
  };

  return (
    <div
      className="table"
      ref={scrollRef}
      role="table"
      aria-rowcount={messages.length}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="thead" role="row" style={{ minWidth: totalWidth }}>
        {visible.map((id) => (
          <div
            key={id}
            className={[
              "th",
              dragged === id && "dragged",
              dropAt?.id === id &&
                (dropAt.after ? "drop-after" : "drop-before"),
            ]
              .filter(Boolean)
              .join(" ")}
            role="columnheader"
            aria-label={labels[id]}
            style={style(id)}
            onDragOver={(e) => onDragOver(e, id)}
            onDrop={onDrop}
          >
            <span
              className="th-label"
              draggable
              title="Drag to move the column"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                setDragged(id);
              }}
              onDragEnd={() => {
                setDragged(undefined);
                setDropAt(undefined);
              }}
            >
              {id === "@timestamp"
                ? `Time (${utc ? "UTC" : localZone()})`
                : labels[id]}
            </span>
            {filterInput(id, "match")}
            {filterInput(id, "exclude")}
            <div
              className={`resizer${resizing === id ? " resizing" : ""}`}
              role="separator"
              aria-label={`Resize ${labels[id]}`}
              title="Drag to resize, double click to reset"
              onMouseDown={(e) => startResize(e, id)}
              onDoubleClick={() => resetWidth(id)}
            />
          </div>
        ))}
      </div>
      <div
        className="tbody"
        style={{ height: virtualizer.getTotalSize(), minWidth: totalWidth }}
      >
        {virtualizer.getVirtualItems().map((v) => {
          const m = messages[v.index]!;
          const selected = m.id === p.selected;
          return (
            <div
              key={m.id}
              className={`tr sev-row-${m.severity_text}${selected ? " selected" : ""}`}
              role="row"
              aria-selected={selected}
              style={{ transform: `translateY(${v.start}px)` }}
              onClick={() => p.onSelect(selected ? undefined : m.id)}
            >
              {visible.map((id) => {
                const text = cellText(m, id, utc);
                return (
                  <div
                    key={id}
                    className={
                      id === "severity_text" ? `td sev sev-${text}` : "td"
                    }
                    role="cell"
                    title={id === "message" || id === "data" ? text : undefined}
                    style={style(id)}
                    onContextMenu={(e) => p.onCellMenu(e, m, id)}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {messages.length === 0 && <div className="empty">No messages</div>}
    </div>
  );
}
