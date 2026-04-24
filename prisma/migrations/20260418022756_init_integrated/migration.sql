-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultMode" TEXT NOT NULL DEFAULT 'phone',
    "flow" JSONB NOT NULL,
    "ttsVoice" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "visitorId" TEXT,
    "displayName" TEXT,
    "note" TEXT,
    "callStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "leadId" TEXT,
    "mode" TEXT NOT NULL,
    "twilioCallSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "cursor" JSONB,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "metadata" JSONB,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnNo" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transcript" TEXT,
    "editedText" TEXT,
    "dtmf" TEXT,
    "confidence" DOUBLE PRECISION,
    "candidateQaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchedQaId" TEXT,
    "systemText" TEXT,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_key_idx" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Project_shortId_key" ON "Project"("shortId");

-- CreateIndex
CREATE INDEX "Project_shortId_idx" ON "Project"("shortId");

-- CreateIndex
CREATE INDEX "QaItem_projectId_idx" ON "QaItem"("projectId");

-- CreateIndex
CREATE INDEX "Lead_projectId_idx" ON "Lead"("projectId");

-- CreateIndex
CREATE INDEX "Lead_callStatus_idx" ON "Lead"("callStatus");

-- CreateIndex
CREATE INDEX "Lead_projectId_phoneNumber_idx" ON "Lead"("projectId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_twilioCallSid_key" ON "ConversationSession"("twilioCallSid");

-- CreateIndex
CREATE INDEX "ConversationSession_projectId_startedAt_idx" ON "ConversationSession"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "ConversationSession_leadId_idx" ON "ConversationSession"("leadId");

-- CreateIndex
CREATE INDEX "ConversationTurn_sessionId_turnNo_idx" ON "ConversationTurn"("sessionId", "turnNo");

-- AddForeignKey
ALTER TABLE "QaItem" ADD CONSTRAINT "QaItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
