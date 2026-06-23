import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import {
  countChars,
  INTERVIEW_NOTES_MAX_CHARS,
} from "@/lib/text-char-limit";

export const jobTypeValues = ["FULL_TIME", "PART_TIME", "CONTRACT"] as const;

const salaryCurrencySchema = z.enum(SUPPORTED_CURRENCIES);

export const jobTypeSchema = z.enum(jobTypeValues);

export const createJobPostingSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required").max(10000),
  type: jobTypeSchema,
  isRemote: z.boolean().default(false),
  salaryRange: z.string().max(100).optional().nullable(),
  salaryCurrency: salaryCurrencySchema.optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateJobPostingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(10000).optional(),
  type: jobTypeSchema.optional(),
  isRemote: z.boolean().optional(),
  salaryRange: z.string().max(100).optional().nullable(),
  salaryCurrency: salaryCurrencySchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

const resumeUrlSchema = z
  .url("Resume link must be a valid URL")
  .refine((url) => url.startsWith("https://"), {
    message: "Resume link must use HTTPS",
  });

function stripNullBytes(value: string): string {
  return value.replace(/\0/g, "");
}

function sanitizeJobApplicationInput(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const record = data as Record<string, unknown>;
  const sanitized = { ...record };
  for (const key of [
    "name",
    "email",
    "phone",
    "resumeText",
    "resumeUrl",
    "coverNote",
    "candidateTimezone",
  ] as const) {
    const value = record[key];
    if (typeof value === "string") {
      sanitized[key] = stripNullBytes(value);
    }
  }
  return sanitized;
}

const jobApplicationFieldsSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.email("Invalid email address"),
  phone: z
    .string()
    .min(8, "Phone number is too short")
    .max(20, "Phone number is too long")
    .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number"),
  coverNote: z.string().max(2000).optional().nullable(),
  resumeText: z
    .string()
    .min(50, "Please paste at least 50 characters of your resume")
    .max(5000, "Resume text is too long"),
  resumeUrl: z
    .string()
    .trim()
    .min(1, "Resume link is required")
    .pipe(resumeUrlSchema),
  candidateTimezone: z.string().min(1).max(100).optional().nullable(),
});

export const jobApplicationSchema = z.preprocess(
  sanitizeJobApplicationInput,
  jobApplicationFieldsSchema,
);

export const applicationStatusValues = [
  "PENDING",
  "SHORTLISTED",
  "REJECTED",
  "HIRED",
] as const;

export const applicationStatusDropdownValues = applicationStatusValues.filter(
  (s) => s !== "HIRED",
);

export const MAX_INTERVIEW_ROUNDS = 4;

export { INTERVIEW_NOTES_MAX_CHARS };

export const countInterviewNotesChars = countChars;

const interviewNotesSchema = z
  .string()
  .max(
    INTERVIEW_NOTES_MAX_CHARS,
    `Notes must be ${INTERVIEW_NOTES_MAX_CHARS} characters or fewer.`,
  )
  .optional()
  .nullable();

const optionalAttendeeNameSchema = z
  .string()
  .max(255, "Interviewer name is too long")
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const scheduleInterviewSchema = z.object({
  roundNumber: z.number().int().min(1).max(MAX_INTERVIEW_ROUNDS),
  scheduledAt: z.iso.datetime({ message: "Invalid date and time" }),
  timezone: z.string().min(1, "Timezone is required").max(100),
  notes: interviewNotesSchema,
  attendeeEmail: z.email("Invalid attendee email").optional().nullable(),
  attendeeName: optionalAttendeeNameSchema,
});

export const rescheduleInterviewSchema = z.object({
  scheduledAt: z.iso.datetime({ message: "Invalid date and time" }),
  timezone: z.string().min(1, "Timezone is required").max(100),
  notes: interviewNotesSchema,
  attendeeEmail: z.email("Invalid attendee email").optional().nullable(),
  attendeeName: optionalAttendeeNameSchema,
});

export function formatSalaryDisplay(
  salaryRange: string | null | undefined,
  salaryCurrency: string | null | undefined,
): string | null {
  const range = salaryRange?.trim();
  if (!range) return null;
  const currency = salaryCurrency?.trim();
  return currency ? `${currency} ${range}` : range;
}

export function formatJobTypeLabel(type: (typeof jobTypeValues)[number]) {
  switch (type) {
    case "FULL_TIME":
      return "Full-time";
    case "PART_TIME":
      return "Part-time";
    case "CONTRACT":
      return "Contract";
    default:
      return type;
  }
}
