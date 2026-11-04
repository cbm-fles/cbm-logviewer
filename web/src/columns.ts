// The columns of the table: their order, widths and which are shown.

import { fields } from "@cbm-logviewer/shared";

export interface Columns {
  // all fields, in the order of the columns
  order: string[];
  // the fields shown
  visible: Record<string, boolean>;
  // the widths in pixels that were set; the others have their default width
  widths: Record<string, number>;
}

// Message takes the remaining width, until its width is set.
export const flexColumn = "message";

export const minWidth = 40;

export const defaultWidths: Record<string, number> = {
  "@timestamp": 190,
  severity_text: 64,
  host: 80,
  service: 90,
  instance: 70,
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

export const defaultColumns: Columns = {
  order: fields.map((f) => f.name),
  visible: Object.fromEntries(fields.map((f) => [f.name, f.visible])),
  widths: {},
};

export function width(columns: Columns, id: string): number {
  return columns.widths[id] ?? defaultWidths[id] ?? 120;
}

export function shown(columns: Columns): string[] {
  return columns.order.filter((id) => columns.visible[id]);
}

// Columns as stored, with the fields of this version: unknown ones are left
// out, new ones are added where they are by default.
export function normalize(stored: Partial<Columns> | undefined): Columns {
  const names = new Set(defaultColumns.order);
  const order = (stored?.order ?? []).filter((id) => names.has(id));
  defaultColumns.order.forEach((id, i) => {
    if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id);
  });
  return {
    order,
    visible: { ...defaultColumns.visible, ...stored?.visible },
    widths: Object.fromEntries(
      Object.entries(stored?.widths ?? {}).filter(
        ([id, w]) => names.has(id) && typeof w === "number" && w >= minWidth,
      ),
    ),
  };
}

// Moves a column before another one, or to the end.
export function move(
  order: string[],
  id: string,
  before: string | undefined,
): string[] {
  if (id === before) return order;
  const rest = order.filter((c) => c !== id);
  const at = before === undefined ? rest.length : rest.indexOf(before);
  if (at < 0) return order;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
