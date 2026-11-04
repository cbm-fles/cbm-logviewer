// Settings of the viewer that the browser keeps, if it can.

import type { ColumnSizingState, VisibilityState } from "@tanstack/react-table";
import { useEffect, useState } from "react";

export interface Settings {
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  utc: boolean;
  limit: number;
}

const key = "cbm-logviewer.settings";

function load(defaults: Settings): Settings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? "{}",
    ) as Partial<Settings>;
    return {
      ...defaults,
      ...stored,
      columnVisibility: {
        ...defaults.columnVisibility,
        ...stored.columnVisibility,
      },
    };
  } catch {
    return defaults;
  }
}

export function useSettings(defaults: Settings) {
  const [settings, setSettings] = useState(() => load(defaults));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      // not kept, e.g. in a private window
    }
  }, [settings]);
  const update = (change: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...change }));
  return [settings, update] as const;
}
