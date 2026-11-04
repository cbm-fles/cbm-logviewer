import {
  type LiveEvent,
  type LogMessage,
  fields,
  severities,
} from "@cbm-logviewer/shared";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LiveConnection, type LiveState, query } from "./api";
import { CellMenu, type CellMenuState } from "./CellMenu";
import { fileName, save, toCsv, toJson } from "./download";
import {
  type FieldInput,
  type Mode,
  type View,
  addPattern,
  isFilterField,
  literalPattern,
  liveFilters,
  queryFilters,
  viewFromSearch,
  viewToSearch,
} from "./filters";
import { Inspector } from "./Inspector";
import { LogTable, cellText, defaultVisibility } from "./LogTable";
import { mergeNewest } from "./merge";
import { useSettings } from "./settings";
import { Toolbar } from "./Toolbar";

interface QueryStatus {
  total: number;
  tookMs: number;
}

export function App() {
  const [settings, updateSettings] = useSettings({
    columnVisibility: defaultVisibility,
    columnSizing: {},
    utc: false,
    limit: 10000,
  });
  // what is entered; it applies at once, except the text of filters and a
  // custom time range, which apply with Enter or Run
  const [view, setView] = useState<View>(() => viewFromSearch(location.search));
  const mode = view.mode;
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<LogMessage>();
  const [menu, setMenu] = useState<CellMenuState>();

  const [loading, setLoading] = useState(false);
  const [queryStatus, setQueryStatus] = useState<QueryStatus>();
  const abort = useRef<AbortController>(undefined);

  const [liveState, setLiveState] = useState<LiveState>("closed");
  const [paused, setPaused] = useState(false);
  const [dropped, setDropped] = useState(0);
  const [pending, setPending] = useState<LogMessage[]>([]);
  const live = useRef<LiveConnection>(undefined);
  const liveRequest = useRef<ReturnType<typeof liveFilters>>({});

  const limit = settings.limit;

  const runQuery = useCallback(
    async (v: View) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError(undefined);
      try {
        const res = await query(
          { filters: queryFilters(v), limit },
          controller.signal,
        );
        setMessages(res.messages);
        setQueryStatus({ total: res.total, tookMs: res.took_ms });
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message);
      } finally {
        if (abort.current === controller) setLoading(false);
      }
    },
    [limit],
  );

  // Applies a view: in the URL, and in a query or the live mode.
  const apply = (v: View) => {
    history.replaceState(null, "", viewToSearch(v) || location.pathname);
    if (v.mode === "query") {
      void runQuery(v);
    } else {
      liveRequest.current = liveFilters(v);
      live.current?.send({ type: "start", filters: liveRequest.current });
    }
  };

  const changeView = (change: Partial<View>) => {
    const v = { ...view, ...change };
    setView(v);
    const immediate =
      change.severities !== undefined ||
      (change.range !== undefined && change.range !== "custom");
    if (immediate) apply(v);
  };

  const filterOn = (
    field: string,
    value: string,
    kind: "match" | "exclude",
  ) => {
    if (!isFilterField(field)) return;
    const input = view.fields[field] ?? { match: "", exclude: "" };
    const v = {
      ...view,
      fields: {
        ...view.fields,
        [field]: {
          ...input,
          [kind]: addPattern(input[kind], literalPattern(value)),
        },
      },
    };
    setView(v);
    apply(v);
  };

  // the live mode; the refs let the connection's callback see current values
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const onLiveEvent = useCallback((event: LiveEvent) => {
    if (event.type === "error") setError(event.error);
    if (event.type === "started") setError(undefined);
    if (event.type !== "messages") return;
    if (event.dropped > 0) setDropped((d) => d + event.dropped);
    const add = (prev: LogMessage[]) =>
      mergeNewest(prev, event.messages, limitRef.current);
    if (pausedRef.current) setPending(add);
    else setMessages(add);
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    const connection = new LiveConnection(onLiveEvent, setLiveState);
    live.current = connection;
    connection.send({ type: "start", filters: liveRequest.current });
    return () => {
      connection.close();
      live.current = undefined;
      setLiveState("closed");
    };
  }, [mode, onLiveEvent]);

  const changeMode = (m: Mode) => {
    if (m === mode) return;
    abort.current?.abort();
    setLoading(false);
    setMessages([]);
    setPending([]);
    setDropped(0);
    setPaused(false);
    setError(undefined);
    setQueryStatus(undefined);
    const v = { ...view, mode: m };
    setView(v);
    apply(v);
  };

  const pause = (p: boolean) => {
    if (!p) {
      setMessages((prev) => mergeNewest(prev, pending, limit));
      setPending([]);
    }
    setPaused(p);
  };

  const visibleColumns = fields.filter(
    (f) => settings.columnVisibility[f.name] !== false,
  );
  const download = (format: "json" | "csv") => {
    if (format === "json") {
      save(toJson(messages), "application/x-ndjson", fileName("jsonl"));
    } else {
      const columns = visibleColumns.map((f) => ({
        id: f.name,
        label: f.label,
      }));
      save(
        toCsv(messages, columns, (m, field) =>
          cellText(m, field, settings.utc),
        ),
        "text/csv",
        fileName("csv"),
      );
    }
  };

  const openMenu = (e: MouseEvent, m: LogMessage, field: string) => {
    e.preventDefault();
    const label = fields.find((f) => f.name === field)?.label ?? field;
    const raw = (m as unknown as Record<string, unknown>)[field];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      field,
      label,
      value:
        field === "@timestamp"
          ? m["@timestamp"]
          : cellText(m, field, settings.utc),
      filter: isFilterField(field) && raw !== undefined && raw !== null,
    });
  };
  const closeMenu = useCallback(() => setMenu(undefined), []);

  // the view of the URL when the page opens
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    apply(view);
  });

  const hasFieldFilters = Object.values(view.fields).some(
    (f) => f.match.trim() || f.exclude.trim(),
  );

  return (
    <div className="app">
      <Toolbar
        view={view}
        onView={changeView}
        onMode={changeMode}
        hasFieldFilters={hasFieldFilters}
        onClearFilters={() => {
          const v = { ...view, fields: {} };
          setView(v);
          apply(v);
        }}
        limit={limit}
        onLimit={(l) => updateSettings({ limit: l })}
        onQuery={() => apply(view)}
        loading={loading}
        paused={paused}
        onPause={pause}
        onClear={() => {
          setMessages([]);
          setPending([]);
          setDropped(0);
        }}
        onDownload={download}
        utc={settings.utc}
        onUtc={(utc) => updateSettings({ utc })}
        columnVisibility={settings.columnVisibility}
        onColumnVisibility={(columnVisibility) =>
          updateSettings({ columnVisibility })
        }
      />
      <div className="main">
        <LogTable
          messages={messages}
          utc={settings.utc}
          columnVisibility={settings.columnVisibility}
          columnSizing={settings.columnSizing}
          onColumnSizingChange={(columnSizing) =>
            updateSettings({ columnSizing })
          }
          resetKey={mode === "live" ? mode : queryStatus}
          filters={view.fields}
          onFilter={(field, input: FieldInput) =>
            setView((v) => ({ ...v, fields: { ...v.fields, [field]: input } }))
          }
          onApply={() => apply(view)}
          selected={selected?.id}
          onSelect={(id) => setSelected(messages.find((m) => m.id === id))}
          onCellMenu={openMenu}
        />
        {selected && (
          <Inspector
            message={selected}
            utc={settings.utc}
            onFilter={filterOn}
            onClose={() => setSelected(undefined)}
          />
        )}
      </div>
      {menu && <CellMenu menu={menu} onFilter={filterOn} onClose={closeMenu} />}
      <StatusBar
        mode={mode}
        messages={messages}
        queryStatus={queryStatus}
        loading={loading}
        liveState={liveState}
        paused={paused}
        pending={pending.length}
        dropped={dropped}
        error={error}
      />
    </div>
  );
}

function StatusBar(p: {
  mode: Mode;
  messages: LogMessage[];
  queryStatus: QueryStatus | undefined;
  loading: boolean;
  liveState: LiveState;
  paused: boolean;
  pending: number;
  dropped: number;
  error: string | undefined;
}) {
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of p.messages)
      c.set(m.severity_text, (c.get(m.severity_text) ?? 0) + 1);
    return c;
  }, [p.messages]);
  const n = (x: number) => x.toLocaleString("en");

  let state: string;
  if (p.mode === "query") {
    state = p.loading
      ? "Querying…"
      : p.queryStatus
        ? `${n(p.messages.length)} of ${n(p.queryStatus.total)} messages, in ${(p.queryStatus.tookMs / 1000).toFixed(1)} s`
        : "";
  } else {
    const connection =
      p.liveState === "live"
        ? "Live"
        : p.liveState === "connecting"
          ? "Connecting…"
          : "Disconnected, reconnecting…";
    state = [
      connection,
      `${n(p.messages.length)} messages`,
      p.paused && `paused, ${n(p.pending)} new`,
      p.dropped > 0 && `${n(p.dropped)} dropped`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <footer className="statusbar">
      <span className={`state live-${p.mode === "live" ? p.liveState : "off"}`}>
        {state}
      </span>
      {p.error && <span className="error">{p.error}</span>}
      <span className="counts">
        {severities.map((s) =>
          counts.get(s.text) ? (
            <span key={s.code} className={`sev-${s.text}`}>
              {s.text} {n(counts.get(s.text)!)}
            </span>
          ) : null,
        )}
      </span>
    </footer>
  );
}
