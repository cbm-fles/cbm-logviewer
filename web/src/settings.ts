// Settings of the viewer that the browser keeps, if it can.

import { useEffect, useState } from "react";
import { type Columns, defaultColumns, normalize } from "./columns";

export interface Settings {
  columns: Columns;
  utc: boolean;
  limit: number;
}

const defaults: Settings = {
  columns: defaultColumns,
  utc: false,
  limit: 10000,
};

const key = "cbm-logviewer.settings";

function load(): Settings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? "{}",
    ) as Partial<Settings>;
    return {
      utc: typeof stored.utc === "boolean" ? stored.utc : defaults.utc,
      limit: typeof stored.limit === "number" ? stored.limit : defaults.limit,
      columns: normalize(stored.columns),
    };
  } catch {
    return defaults;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      // not kept, e.g. in a private window
    }
  }, [settings]);
  // a change, or a function of the current settings that returns it
  const update = (
    change: Partial<Settings> | ((s: Settings) => Partial<Settings>),
  ) =>
    setSettings((s) => ({
      ...s,
      ...(typeof change === "function" ? change(s) : change),
    }));
  return [settings, update] as const;
}
