-- CreateEnum
CREATE TYPE "Department" AS ENUM ('SOT', 'SOM', 'GENERAL');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "department" "Department" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" "Department" NOT NULL DEFAULT 'GENERAL';
