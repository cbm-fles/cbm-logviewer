// Small icons, drawn in the colour of the text unless coloured in CSS.

const paths: Record<string, string> = {
  match: "M3 8.5l3.2 3.2L13 4.8",
  exclude: "M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M4.1 4.1l7.8 7.8",
  clear: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4",
  copy: "M5.5 5.5h7v8h-7zM3.5 10.5v-8h7",
};

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={`icon icon-${name}`}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
