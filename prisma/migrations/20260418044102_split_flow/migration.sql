/*
  Warnings:

  - You are about to drop the column `flow` on the `Project` table. All the data in the column will be lost.
  - Added the required column `phoneFlow` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `webFlow` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "flow",
ADD COLUMN     "phoneFlow" JSONB NOT NULL,
ADD COLUMN     "webFlow" JSONB NOT NULL;
