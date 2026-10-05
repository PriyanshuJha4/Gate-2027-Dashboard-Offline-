"use client";

/** Red box shown when data could not be loaded or a change could not be saved. Renders nothing when `message` is empty. */
export default function ApiStatusBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      <span>{message}</span>
      <span className="flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Dismiss
          </button>
        )}
      </span>
    </div>
  );
}
