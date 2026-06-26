-- CreateEnum
CREATE TYPE "SlotHoldStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED');

-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "consultationType" TEXT NOT NULL,
    "status" "SlotHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one ACTIVE hold per doctor/date/time (enum cast matches BookingSession index style).
CREATE UNIQUE INDEX "SlotHold_doctorId_date_time_active_key"
ON "SlotHold"("doctorId", "date", "time")
WHERE "status" = 'ACTIVE'::"SlotHoldStatus";
