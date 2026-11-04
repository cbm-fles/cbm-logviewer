import { severities } from "@cbm-logviewer/shared";
import { useEffect, useState } from "react";

interface Status {
  opensearch: "ok" | "unavailable";
  cluster_status?: string;
  index: string;
}

export function App() {
  const [status, setStatus] = useState<Status | undefined>();

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setStatus(undefined));
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <span className="title">CBM Log Viewer</span>
        {severities.map((s) => (
          <span key={s.code} className={`severity sev-${s.text}`}>
            {s.text}
          </span>
        ))}
        <span className="status">
          {status
            ? `${status.index}: OpenSearch ${status.cluster_status ?? status.opensearch}`
            : "no connection to the server"}
        </span>
      </header>
    </div>
  );
}
