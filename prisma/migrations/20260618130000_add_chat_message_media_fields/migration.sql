-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "imageKey" TEXT;
