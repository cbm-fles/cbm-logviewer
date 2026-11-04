// The table of messages: one line per message, virtualized, so that it stays
// fast with 100000 messages. TanStack Table manages the columns only: its rows
// would take some 3 kB per message.

import { type LogMessage, fields } from "@cbm-logviewer/shared";
import {
  type ColumnDef,
  type ColumnSizingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { type FieldInput, type FieldInputs, isFilterField } from "./filters";
import { formatTime, formatValue, localZone } from "./format";

export const rowHeight = 20;

// the column that takes the remaining width
const flexColumn = "message";

const sizes: Record<string, number> = {
  "@timestamp": 190,
  severity_text: 64,
  host: 80,
  service: 90,
  thread: 100,
  tid: 70,
  pid: 70,
  timeslice: 110,
  message: 400,
  message_template: 250,
  file_name: 140,
  line: 50,
  function: 140,
  version: 170,
  log_file: 220,
  data: 220,
};

const noRows: LogMessage[] = [];

export const defaultVisibility: VisibilityState = Object.fromEntries(
  fields.map((f) => [f.name, f.visible]),
);

export function cellText(m: LogMessage, field: string, utc: boolean): string {
  if (field === "@timestamp") return formatTime(m["@timestamp"], utc);
  return formatValue((m as unknown as Record<string, unknown>)[field]);
}

interface Props {
  messages: LogMessage[];
  utc: boolean;
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  onColumnSizingChange: (sizing: ColumnSizingState) => void;
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
  const { messages, utc, columnSizing } = p;
  const columns = useMemo<ColumnDef<LogMessage>[]>(
    () =>
      fields.map((f) => ({
        id: f.name,
        header:
          f.name === "@timestamp"
            ? `Time (${utc ? "UTC" : localZone()})`
            : f.label,
        size: sizes[f.name] ?? 120,
        minSize: 40,
      })),
    [utc],
  );

  const table = useReactTable({
    data: noRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    state: { columnVisibility: p.columnVisibility, columnSizing },
    onColumnSizingChange: (updater) =>
      p.onColumnSizingChange(
        typeof updater === "function" ? updater(columnSizing) : updater,
      ),
  });

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

  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const visible = table.getVisibleLeafColumns();
  const width = (id: string, size: number) =>
    id === flexColumn
      ? { flex: `1 0 ${size}px` }
      : { width: size, flex: "none" };
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
      <div
        className="thead"
        role="row"
        style={{ minWidth: table.getTotalSize() }}
      >
        {headers.map((h) => (
          <div
            key={h.id}
            className="th"
            role="columnheader"
            style={width(h.column.id, h.getSize())}
          >
            <span className="th-label">
              {flexRender(h.column.columnDef.header, h.getContext())}
            </span>
            {filterInput(h.column.id, "match")}
            {filterInput(h.column.id, "exclude")}
            <div
              className={`resizer${h.column.getIsResizing() ? " resizing" : ""}`}
              onMouseDown={h.getResizeHandler()}
              onTouchStart={h.getResizeHandler()}
              onDoubleClick={() => h.column.resetSize()}
            />
          </div>
        ))}
      </div>
      <div
        className="tbody"
        style={{
          height: virtualizer.getTotalSize(),
          minWidth: table.getTotalSize(),
        }}
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
              {visible.map((column) => {
                const id = column.id;
                const text = cellText(m, id, utc);
                return (
                  <div
                    key={id}
                    className={
                      id === "severity_text" ? `td sev sev-${text}` : "td"
                    }
                    role="cell"
                    title={
                      id === flexColumn || id === "data" ? text : undefined
                    }
                    style={width(id, column.getSize())}
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
