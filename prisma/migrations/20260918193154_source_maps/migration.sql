-- AlterTable
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "api_key" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "auth_session" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

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

-- CreateTable
CREATE TABLE "source_map" (
    "source_map_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "release" VARCHAR(100) NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "content" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_map_pkey" PRIMARY KEY ("source_map_id")
);

-- CreateIndex
CREATE INDEX "source_map_website_id_release_idx" ON "source_map"("website_id", "release");

-- CreateIndex
CREATE UNIQUE INDEX "source_map_website_id_release_file_name_key" ON "source_map"("website_id", "release", "file_name");

-- CreateIndex
CREATE INDEX "error_event_website_id_release_idx" ON "error_event"("website_id", "release");
