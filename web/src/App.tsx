import {
  type LiveEvent,
  type LogMessage,
  fields,
  maxQueryLimit,
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
import { shown } from "./columns";
import { fileName, save, toCsv, toJson } from "./download";
import {
  type FieldInput,
  type Mode,
  type View,
  addPattern,
  countFilters,
  isFilterField,
  literalPattern,
  liveFilters,
  queryFilters,
  viewFromSearch,
  viewToSearch,
} from "./filters";
import { FilterPanel } from "./FilterPanel";
import { Inspector } from "./Inspector";
import { LogTable, cellText } from "./LogTable";
import { mergeNewest } from "./merge";
import { useSettings } from "./settings";
import { Toolbar } from "./Toolbar";

// the number of messages of a query, and kept in live mode
const limit = maxQueryLimit;

interface QueryStatus {
  total: number;
  tookMs: number;
}

export function App() {
  const [settings, updateSettings] = useSettings();
  // what is entered; it applies at once, except the text of filters and a
  // custom time range, which apply with Enter or Run
  const [view, setView] = useState<View>(() => viewFromSearch(location.search));
  const mode = view.mode;
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<LogMessage>();
  const [menu, setMenu] = useState<CellMenuState>();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // the filters of the columns that apply, which can differ from what is entered
  const [applied, setApplied] = useState<View["fields"]>({});

  const [loading, setLoading] = useState(false);
  const [queryStatus, setQueryStatus] = useState<QueryStatus>();
  const abort = useRef<AbortController>(undefined);

  const [liveState, setLiveState] = useState<LiveState>("closed");
  const [paused, setPaused] = useState(false);
  const [dropped, setDropped] = useState(0);
  const [pending, setPending] = useState<LogMessage[]>([]);
  const live = useRef<LiveConnection>(undefined);
  const liveRequest = useRef<ReturnType<typeof liveFilters>>({});
  // Each start of the live mode, also after a reconnect, loads the newest
  // messages for its filters and adds the new ones to them. Until the server
  // confirms a start, messages are of the previous one; while loading, the new
  // ones wait.
  const livePhase = useRef<"waiting" | "loading" | "live">("waiting");
  const sinceStart = useRef<LogMessage[]>([]);
  const reloadAbort = useRef<AbortController>(undefined);
  const [liveLoading, setLiveLoading] = useState(false);
  // counts the loads, to show the newest messages after each
  const [liveLoads, setLiveLoads] = useState(0);

  const runQuery = useCallback(async (v: View) => {
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
  }, []);

  // Applies a view: in the URL, and in a query or the live mode.
  const apply = (v: View) => {
    history.replaceState(null, "", viewToSearch(v) || location.pathname);
    setApplied(v.fields);
    if (v.mode === "query") {
      void runQuery(v);
    } else {
      startLive(liveFilters(v));
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

  const clearFilter = (field: string) => {
    if (!isFilterField(field)) return;
    const { [field]: _, ...rest } = view.fields;
    const v = { ...view, fields: rest };
    setView(v);
    apply(v);
  };

  // the live mode; the ref lets the connection's callback see the current value
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  function startLive(filters: ReturnType<typeof liveFilters>) {
    reloadAbort.current?.abort();
    liveRequest.current = filters;
    livePhase.current = "waiting";
    setLiveLoading(true);
    setDropped(0);
    live.current?.send({ type: "start", filters });
  }

  const reload = useCallback(async () => {
    reloadAbort.current?.abort();
    const controller = new AbortController();
    reloadAbort.current = controller;
    livePhase.current = "loading";
    sinceStart.current = [];
    setLiveLoading(true);
    try {
      const res = await query(
        { filters: liveRequest.current, limit },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setMessages(mergeNewest(res.messages, sinceStart.current, limit));
      setPending([]);
      setLiveLoads((n) => n + 1);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError((err as Error).message);
      const added = sinceStart.current;
      setMessages((prev) => mergeNewest(prev, added, limit));
    }
    livePhase.current = "live";
    sinceStart.current = [];
    setLiveLoading(false);
  }, []);

  const onLiveEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "error") setError(event.error);
      if (event.type === "started") {
        setError(undefined);
        void reload();
      }
      if (event.type !== "messages" || livePhase.current === "waiting") return;
      if (event.dropped > 0) setDropped((d) => d + event.dropped);
      if (livePhase.current === "loading") {
        sinceStart.current = mergeNewest(
          sinceStart.current,
          event.messages,
          limit,
        );
        return;
      }
      const add = (prev: LogMessage[]) =>
        mergeNewest(prev, event.messages, limit);
      if (pausedRef.current) setPending(add);
      else setMessages(add);
    },
    [reload],
  );

  useEffect(() => {
    if (mode !== "live") return;
    const connection = new LiveConnection(onLiveEvent, setLiveState);
    live.current = connection;
    livePhase.current = "waiting";
    connection.send({ type: "start", filters: liveRequest.current });
    return () => {
      connection.close();
      reloadAbort.current?.abort();
      live.current = undefined;
      setLiveState("closed");
      setLiveLoading(false);
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

  const download = (format: "json" | "csv") => {
    if (format === "json") {
      save(toJson(messages), "application/x-ndjson", fileName("jsonl"));
    } else {
      const columns = shown(settings.columns).map((id) => ({
        id,
        label: fields.find((f) => f.name === id)?.label ?? id,
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
    const input = isFilterField(field) ? view.fields[field] : undefined;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      id: m.id,
      field,
      label,
      value:
        field === "@timestamp"
          ? m["@timestamp"]
          : cellText(m, field, settings.utc),
      filterable: isFilterField(field),
      hasValue: raw !== undefined && raw !== null && raw !== "",
      hasFilter: input !== undefined && countFilters({ [field]: input }) > 0,
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

  // the inspector closes when its message is not shown any more
  useEffect(() => {
    if (selected && !messages.some((m) => m.id === selected.id)) {
      setSelected(undefined);
    }
  }, [messages, selected]);

  const clearFilters = () => {
    const v = { ...view, fields: {} };
    setView(v);
    apply(v);
  };
  const setFilter = (field: string, input: FieldInput) =>
    setView((v) => ({ ...v, fields: { ...v.fields, [field]: input } }));

  return (
    <div className="app">
      <Toolbar
        view={view}
        onView={changeView}
        onMode={changeMode}
        filterCount={countFilters(applied)}
        onClearFilters={clearFilters}
        onEditFilters={() => setFiltersOpen(true)}
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
        columns={settings.columns}
        onColumns={(columns) => updateSettings({ columns })}
      />
      <div className="main">
        <LogTable
          messages={messages}
          utc={settings.utc}
          columns={settings.columns}
          onColumns={(change) =>
            updateSettings((s) => ({ columns: change(s.columns) }))
          }
          resetKey={mode === "live" ? liveLoads : queryStatus}
          filters={view.fields}
          onFilter={setFilter}
          onApply={() => apply(view)}
          selected={selected?.id}
          onSelect={(id) => setSelected(messages.find((m) => m.id === id))}
          onCellMenu={openMenu}
        />
        {(selected || filtersOpen) && (
          <div className="side">
            {selected && (
              <Inspector
                message={selected}
                utc={settings.utc}
                onFilter={filterOn}
                onClose={() => setSelected(undefined)}
              />
            )}
            {filtersOpen && (
              <FilterPanel
                filters={view.fields}
                columns={settings.columns}
                onFilter={setFilter}
                onApply={() => apply(view)}
                onClear={clearFilters}
                onClose={() => setFiltersOpen(false)}
              />
            )}
          </div>
        )}
      </div>
      {menu && (
        <CellMenu
          menu={menu}
          onFilter={filterOn}
          onClearFilter={clearFilter}
          onInspect={(id) => setSelected(messages.find((m) => m.id === id))}
          onClose={closeMenu}
        />
      )}
      <StatusBar
        mode={mode}
        messages={messages}
        queryStatus={queryStatus}
        loading={loading}
        liveState={liveState}
        liveLoading={liveLoading}
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
  liveLoading: boolean;
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
        ? `${n(p.messages.length)} of ${n(p.queryStatus.total)} messages${p.queryStatus.total > p.messages.length ? ` (the newest ${n(limit)})` : ""}, in ${(p.queryStatus.tookMs / 1000).toFixed(1)} s`
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
      p.liveLoading && p.liveState === "live" ? "loading…" : null,
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
