// ---------------------------------------------------------------------------
// Shared utility helpers used across the renderer
// ---------------------------------------------------------------------------

/** Format an ISO date string to a short human-readable string. */
export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

/** Escape a string for safe insertion into innerHTML. */
export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] ?? char),
  );

/**
 * Convert a Date to the value expected by <input type="datetime-local">.
 * Adjusts for the local timezone offset so the displayed time matches local time.
 */
export const toLocalDatetimeInput = (date: Date): string => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
};

/** Default greeting template. */
export const DEFAULT_GREETING = 'Good morning, {name}.';

/**
 * Render the greeting string for the Today header.
 * Replaces {name} with the user's display name.
 */
export const renderGreeting = (greeting: string, userName: string): string =>
  escapeHtml((greeting || DEFAULT_GREETING).replaceAll('{name}', userName));
