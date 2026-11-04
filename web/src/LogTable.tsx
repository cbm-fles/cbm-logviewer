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
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

function cellText(m: LogMessage, field: string, utc: boolean): string {
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
}

export function LogTable({
  messages,
  utc,
  columnVisibility,
  columnSizing,
  onColumnSizingChange,
  resetKey,
}: Props) {
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
    state: { columnVisibility, columnSizing },
    onColumnSizingChange: (updater) =>
      onColumnSizingChange(
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
  }, [resetKey]);
  // after the messages changed, also when old ones were dropped for new ones
  useLayoutEffect(() => {
    if (atEnd.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages, virtualizer]);

  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const visible = table.getVisibleLeafColumns();
  const width = (id: string, size: number) =>
    id === flexColumn
      ? { flex: `1 0 ${size}px` }
      : { width: size, flex: "none" };

  return (
    <div
      className="table"
      ref={scrollRef}
      role="table"
      aria-rowcount={messages.length}
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
          return (
            <div
              key={m.id}
              className={`tr sev-row-${m.severity_text}`}
              role="row"
              style={{ transform: `translateY(${v.start}px)` }}
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
