import {
  type Filters,
  type LiveEvent,
  type LogMessage,
  severities,
} from "@cbm-logviewer/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveConnection, type LiveState, query } from "./api";
import { LogTable, defaultVisibility } from "./LogTable";
import { mergeNewest } from "./merge";
import { useSettings } from "./settings";
import { type Mode, type RangeId, Toolbar, ranges } from "./Toolbar";

// all but TRACE and DEBUG
const defaultSeverities = severities
  .filter((s) => s.code >= 9)
  .map((s) => s.code);

interface QueryStatus {
  total: number;
  tookMs: number;
}

// a datetime-local value, which is local time, as ISO
function localToIso(value: string): string | undefined {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
}

export function App() {
  const [settings, updateSettings] = useSettings({
    columnVisibility: defaultVisibility,
    columnSizing: {},
    utc: false,
    limit: 10000,
  });
  const [mode, setMode] = useState<Mode>("query");
  const [range, setRange] = useState<RangeId>("1h");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [selected, setSelected] = useState(defaultSeverities);
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [error, setError] = useState<string>();

  const [loading, setLoading] = useState(false);
  const [queryStatus, setQueryStatus] = useState<QueryStatus>();
  const abort = useRef<AbortController>(undefined);

  const [liveState, setLiveState] = useState<LiveState>("closed");
  const [paused, setPaused] = useState(false);
  const [dropped, setDropped] = useState(0);
  const [pending, setPending] = useState<LogMessage[]>([]);
  const live = useRef<LiveConnection>(undefined);

  const limit = settings.limit;
  const severityFilter = useMemo(
    () =>
      selected.length === severities.length ? {} : { severities: selected },
    [selected],
  );

  const runQuery = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const preset = ranges.find((r) => r.id === range);
    const from = preset?.from ?? localToIso(custom.from);
    const to = range === "custom" ? localToIso(custom.to) : undefined;
    const filters: Filters = {
      ...severityFilter,
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    };
    setLoading(true);
    setError(undefined);
    try {
      const res = await query({ filters, limit }, controller.signal);
      setMessages(res.messages);
      setQueryStatus({ total: res.total, tookMs: res.took_ms });
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      if (abort.current === controller) setLoading(false);
    }
  }, [range, custom, severityFilter, limit]);

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
    return () => {
      connection.close();
      live.current = undefined;
      setLiveState("closed");
    };
  }, [mode, onLiveEvent]);

  useEffect(() => {
    live.current?.send({ type: "start", filters: severityFilter });
  }, [mode, severityFilter]);

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
    setMode(m);
  };

  const pause = (p: boolean) => {
    if (!p) {
      setMessages((prev) => mergeNewest(prev, pending, limit));
      setPending([]);
    }
    setPaused(p);
  };

  // a first query when the page opens
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runQuery();
  }, [runQuery]);

  return (
    <div className="app">
      <Toolbar
        mode={mode}
        onMode={changeMode}
        range={range}
        onRange={setRange}
        customFrom={custom.from}
        customTo={custom.to}
        onCustom={(from, to) => setCustom({ from, to })}
        selected={selected}
        onSelected={setSelected}
        limit={limit}
        onLimit={(l) => updateSettings({ limit: l })}
        onQuery={() => void runQuery()}
        loading={loading}
        paused={paused}
        onPause={pause}
        onClear={() => {
          setMessages([]);
          setPending([]);
          setDropped(0);
        }}
        utc={settings.utc}
        onUtc={(utc) => updateSettings({ utc })}
        columnVisibility={settings.columnVisibility}
        onColumnVisibility={(columnVisibility) =>
          updateSettings({ columnVisibility })
        }
      />
      <LogTable
        messages={messages}
        utc={settings.utc}
        columnVisibility={settings.columnVisibility}
        columnSizing={settings.columnSizing}
        onColumnSizingChange={(columnSizing) =>
          updateSettings({ columnSizing })
        }
        resetKey={mode === "live" ? mode : queryStatus}
      />
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
