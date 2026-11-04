// The fields of a log message in OpenSearch, as in the index template of
// flesnet's contrib/loggingstack/setup-opensearch.

export type FieldType = "date" | "keyword" | "text" | "integer" | "object";

export interface Field {
  name: string;
  type: FieldType;
  label: string;
  // shown in the table by default
  visible: boolean;
}

export const fields: readonly Field[] = [
  { name: "@timestamp", type: "date", label: "Time", visible: true },
  { name: "severity_text", type: "keyword", label: "Severity", visible: true },
  { name: "host", type: "keyword", label: "Host", visible: true },
  { name: "service", type: "keyword", label: "Service", visible: true },
  { name: "thread", type: "keyword", label: "Thread", visible: false },
  { name: "tid", type: "integer", label: "TID", visible: false },
  { name: "pid", type: "integer", label: "PID", visible: false },
  { name: "timeslice", type: "integer", label: "Timeslice", visible: true },
  { name: "message", type: "text", label: "Message", visible: true },
  {
    name: "message_template",
    type: "keyword",
    label: "Template",
    visible: false,
  },
  { name: "file_name", type: "keyword", label: "File", visible: false },
  { name: "line", type: "integer", label: "Line", visible: false },
  { name: "function", type: "keyword", label: "Function", visible: false },
  { name: "version", type: "keyword", label: "Version", visible: false },
  { name: "log_file", type: "keyword", label: "Log file", visible: false },
  { name: "data", type: "object", label: "Data", visible: false },
];

// A log message as returned by the server. The timestamp keeps the full
// precision of OpenSearch as a string.
export interface LogMessage {
  id: string;
  "@timestamp": string;
  severity_code: number;
  severity_text: string;
  host?: string;
  service?: string;
  thread?: string;
  tid?: number;
  pid?: number;
  timeslice?: number;
  message: string;
  message_template?: string;
  file_name?: string;
  line?: number;
  function?: string;
  version?: string;
  log_file?: string;
  data?: Record<string, unknown>;
}
