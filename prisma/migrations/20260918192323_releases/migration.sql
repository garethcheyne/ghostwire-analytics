-- AlterTable
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "api_key" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "auth_session" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "error_group" ADD COLUMN     "first_release" VARCHAR(100),
ADD COLUMN     "last_release" VARCHAR(100),
ADD COLUMN     "regressed_release" VARCHAR(100);

-- AlterTable
ALTER TABLE "invitation" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "member" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "organization" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "two_factor" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "website_event" ADD COLUMN     "release" VARCHAR(100);

-- CreateTable
CREATE TABLE "release" (
    "release_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "version" VARCHAR(100) NOT NULL,
    "environment" VARCHAR(50),
    "commit" VARCHAR(100),
    "url" VARCHAR(500),
    "deployed_at" TIMESTAMPTZ(6),
    "first_seen" TIMESTAMPTZ(6) NOT NULL,
    "last_seen" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_pkey" PRIMARY KEY ("release_id")
);

-- CreateIndex
CREATE INDEX "release_website_id_first_seen_idx" ON "release"("website_id", "first_seen");

-- CreateIndex
CREATE UNIQUE INDEX "release_website_id_version_key" ON "release"("website_id", "version");

-- CreateIndex
CREATE INDEX "website_event_website_id_release_created_at_idx" ON "website_event"("website_id", "release", "created_at");
