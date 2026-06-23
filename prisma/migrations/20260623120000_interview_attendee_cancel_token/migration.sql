-- AlterTable
ALTER TABLE "InterviewRound" ADD COLUMN "attendeeCancelToken" TEXT;

-- Backfill existing rows with unique tokens
UPDATE "InterviewRound"
SET "attendeeCancelToken" = encode(gen_random_bytes(32), 'hex')
WHERE "attendeeCancelToken" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InterviewRound_attendeeCancelToken_key" ON "InterviewRound"("attendeeCancelToken");
