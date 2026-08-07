import { useHydrated } from "~/lib/use-hydrated";

export type TimeStyle = "date" | "weekdayDate" | "clock" | "dateTime";

const FORMATS: Record<TimeStyle, Intl.DateTimeFormatOptions> = {
  /** 8/7/2026 */
  date: { year: "numeric", month: "numeric", day: "numeric" },
  /** Fri, Aug 7 */
  weekdayDate: { weekday: "short", month: "short", day: "numeric" },
  /** 3:11 PM */
  clock: { hour: "numeric", minute: "2-digit" },
  /** 8/7/2026, 3:11 PM */
  dateTime: {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
};

/**
 * A timestamp rendered in the visitor's own timezone and locale.
 *
 * The server cannot know either one, so it formats in UTC under a fixed locale
 * and the real value swaps in once hydrated — see `useHydrated` for why the
 * naive version breaks the page rather than merely displaying the wrong hour.
 *
 * The machine-readable `dateTime` attribute is the same string on both sides,
 * so anything reading the markup — an agent included — gets an unambiguous
 * instant regardless of which render it caught.
 */
export function LocalTime({
  value,
  style = "date",
  className,
}: {
  /** An ISO 8601 string, epoch milliseconds, or a `Date`. */
  value: string | number | Date;
  style?: TimeStyle;
  className?: string;
}) {
  const hydrated = useHydrated();
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const formatted = hydrated
    ? new Intl.DateTimeFormat(undefined, FORMATS[style]).format(date)
    : new Intl.DateTimeFormat("en-US", {
        ...FORMATS[style],
        timeZone: "UTC",
      }).format(date);

  return (
    <time dateTime={date.toISOString()} className={className}>
      {formatted}
    </time>
  );
}
