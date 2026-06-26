-- Clean up existing data before adding the partial unique index (race-test duplicates).
UPDATE "BookingSession"
SET "status" = 'EXPIRED'::"BookingSessionStatus"
WHERE "status" = 'PENDING'::"BookingSessionStatus"
  AND "expiresAt" < NOW();

-- Keep the oldest PENDING session per slot; expire newer duplicates.
WITH keepers AS (
  SELECT DISTINCT ON ("doctorId", "date", "time") id
  FROM "BookingSession"
  WHERE "status" = 'PENDING'::"BookingSessionStatus"
  ORDER BY "doctorId", "date", "time", "createdAt" ASC
)
UPDATE "BookingSession" AS bs
SET "status" = 'EXPIRED'::"BookingSessionStatus"
FROM (
  SELECT id
  FROM "BookingSession"
  WHERE "status" = 'PENDING'::"BookingSessionStatus"
    AND id NOT IN (SELECT id FROM keepers)
) AS duplicates
WHERE bs.id = duplicates.id;

-- At most one PENDING booking session per doctor/date/time (Stripe checkout hold).
-- Enum cast matches Appointment_doctorId_date_time_active_key style in 20260406120100.
CREATE UNIQUE INDEX "BookingSession_doctorId_date_time_pending_key"
ON "BookingSession"("doctorId", "date", "time")
WHERE "status" = 'PENDING'::"BookingSessionStatus";
