-- AlterTable
ALTER TABLE "ConversationTurn" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "trainingQuestionCount" INTEGER NOT NULL DEFAULT 3;
