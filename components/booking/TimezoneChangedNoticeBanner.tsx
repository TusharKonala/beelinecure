type TimezoneChangedNoticeBannerProps = {
  message: string;
  onDismiss: () => void;
  className?: string;
};

export function TimezoneChangedNoticeBanner({
  message,
  onDismiss,
  className,
}: TimezoneChangedNoticeBannerProps) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className ?? ""}`}
      role="status"
    >
      <p className="font-montserrat text-sm text-amber-800">{message}</p>
      <button
        type="button"
        className="shrink-0 cursor-pointer font-montserrat text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
