-- CreateTable
CREATE TABLE "ChatConversationHideState" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversationHideState_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateIndex
CREATE INDEX "ChatConversationHideState_userId_idx" ON "ChatConversationHideState"("userId");

-- AddForeignKey
ALTER TABLE "ChatConversationHideState" ADD CONSTRAINT "ChatConversationHideState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
