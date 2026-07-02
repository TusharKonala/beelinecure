import { doctorTimezoneMismatchMessage } from "@/lib/slot-hold-shared";

type DoctorTimezoneMismatchNoticeProps = {
  currentDoctorTimezone: string;
  appointmentTimezone: string;
  className?: string;
};

export function DoctorTimezoneMismatchNotice({
  currentDoctorTimezone,
  appointmentTimezone,
  className,
}: DoctorTimezoneMismatchNoticeProps) {
  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className ?? ""}`}
      role="status"
    >
      <p className="font-montserrat text-sm text-amber-800">
        {doctorTimezoneMismatchMessage(
          currentDoctorTimezone,
          appointmentTimezone,
        )}
      </p>
    </div>
  );
}
