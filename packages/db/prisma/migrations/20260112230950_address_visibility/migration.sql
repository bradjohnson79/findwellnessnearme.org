-- CreateEnum
CREATE TYPE "AddressVisibility" AS ENUM ('PUBLIC', 'CITY_ONLY');

-- AlterTable
ALTER TABLE "ListingLocation" ADD COLUMN     "addressVisibility" "AddressVisibility" NOT NULL DEFAULT 'CITY_ONLY';
