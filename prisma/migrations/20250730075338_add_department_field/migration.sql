/*
  Warnings:

  - Added the required column `department` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `department` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Department" AS ENUM ('SOT', 'SOM');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "department" "Department" NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" "Department" NOT NULL;
