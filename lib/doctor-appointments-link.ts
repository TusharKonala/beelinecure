type DoctorAppointmentsTab = "upcoming" | "pending-review" | "completed" | "cancelled";

export function buildDoctorAppointmentsUrl(
  origin: string,
  opts: { tab?: DoctorAppointmentsTab; search?: string },
): string {
  const base = origin.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (opts.tab) params.set("tab", opts.tab);
  const search = opts.search?.trim();
  if (search) params.set("search", search);
  const qs = params.toString();
  return `${base}/doctor/appointments${qs ? `?${qs}` : ""}`;
}
