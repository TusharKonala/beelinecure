import { z } from "zod";
import { APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS } from "@/lib/text-char-limit";

export { APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS };

export const optionalCancellationNoteSchema = z
  .string()
  .trim()
  .max(
    APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS,
    `Note must be ${APPOINTMENT_CANCELLATION_NOTE_MAX_CHARS} characters or fewer.`,
  )
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const staffCancelAppointmentSchema = z.object({
  appointmentId: z.string().trim().min(1, "appointmentId is required"),
  reason: z
    .enum(["patient_no_show", "doctor_unavailable"])
    .nullish(),
  cancellationNote: optionalCancellationNoteSchema,
});
