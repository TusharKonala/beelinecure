import { z } from "zod";
import {
  ALLOWED_SLOT_DURATION_MINUTES,
  type AllowedSlotDurationMinutes,
} from "@/lib/doctor-availability-slots";

/**
 * Map of slot duration (in minutes, as a string key) → consultation price in
 * cents. Keys are restricted to the four allowed slot durations.
 */
export type ConsultationPriceCentsByDuration = Record<
  "15" | "30" | "45" | "60",
  number
>;

const priceMapSchema: z.ZodType<ConsultationPriceCentsByDuration> = z.object({
  "15": z.number().int().min(1).max(2_000_000),
  "30": z.number().int().min(1).max(2_000_000),
  "45": z.number().int().min(1).max(2_000_000),
  "60": z.number().int().min(1).max(2_000_000),
});

/** Default per-duration price map used when a row is malformed or missing. */
export const DEFAULT_CONSULTATION_PRICE_CENTS_BY_DURATION: ConsultationPriceCentsByDuration =
  {
    "15": 1500,
    "30": 3000,
    "45": 4500,
    "60": 6000,
  };

/**
 * Parse and validate an unknown JSON value into a strict price map. Returns
 * the default map when input is missing or fails validation, so callers can
 * keep the booking flow alive even if the database has a legacy or
 * partially-migrated row.
 */
export function parsePriceMap(
  input: unknown,
): ConsultationPriceCentsByDuration {
  if (input == null) return { ...DEFAULT_CONSULTATION_PRICE_CENTS_BY_DURATION };
  // Prisma's Json fields can be returned as objects directly; nothing to parse
  // when input is already an object.
  const value = typeof input === "string" ? safeJsonParse(input) : input;
  const result = priceMapSchema.safeParse(value);
  if (!result.success) {
    return { ...DEFAULT_CONSULTATION_PRICE_CENTS_BY_DURATION };
  }
  return result.data;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Strict-mode parse — throws if the map is missing or malformed. */
export function strictParsePriceMap(
  input: unknown,
): ConsultationPriceCentsByDuration {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  return priceMapSchema.parse(value);
}

/**
 * Look up the price (in cents) for the given slot duration. Coerces unknown
 * durations to 30 minutes (the legacy default), so any unexpected value still
 * has a price.
 */
export function priceCentsForDuration(
  map: ConsultationPriceCentsByDuration,
  durationMinutes: number,
): number {
  const allowed = ALLOWED_SLOT_DURATION_MINUTES.includes(
    durationMinutes as AllowedSlotDurationMinutes,
  )
    ? (durationMinutes as AllowedSlotDurationMinutes)
    : 30;
  const key = String(allowed) as keyof ConsultationPriceCentsByDuration;
  return map[key];
}

/** Lowest and highest consultation fee across all allowed slot durations. */
export function doctorPriceRangeCents(
  map: ConsultationPriceCentsByDuration,
): { minCents: number; maxCents: number } {
  const prices = ALLOWED_SLOT_DURATION_MINUTES.map((mins) =>
    priceCentsForDuration(map, mins),
  );
  return {
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
  };
}

/** Zod schema for use in API request validation. */
export const consultationPriceCentsByDurationSchema = priceMapSchema;
