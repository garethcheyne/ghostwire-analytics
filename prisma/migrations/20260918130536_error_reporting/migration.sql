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

-- AlterTable
ALTER TABLE "website" ADD COLUMN     "error_key_hash" VARCHAR(64),
ADD COLUMN     "error_key_hint" VARCHAR(12),
ADD COLUMN     "errors_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "error_group" (
    "error_group_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "type" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "culprit" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "count" INTEGER NOT NULL DEFAULT 0,
    "first_seen" TIMESTAMPTZ(6) NOT NULL,
    "last_seen" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "regressed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "error_group_pkey" PRIMARY KEY ("error_group_id")
);

-- CreateTable
CREATE TABLE "error_event" (
    "error_event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "error_group_id" UUID NOT NULL,
    "session_id" UUID,
    "visit_id" UUID,
    "distinct_id" VARCHAR(50),
    "source" VARCHAR(20) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "type" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "stack" TEXT,
    "frames" JSONB,
    "hostname" VARCHAR(100),
    "url_path" VARCHAR(500),
    "browser" VARCHAR(20),
    "os" VARCHAR(20),
    "device" VARCHAR(20),
    "environment" VARCHAR(50),
    "release" VARCHAR(100),
    "context" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_event_pkey" PRIMARY KEY ("error_event_id")
);

-- CreateIndex
CREATE INDEX "error_group_website_id_last_seen_idx" ON "error_group"("website_id", "last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "error_group_website_id_fingerprint_key" ON "error_group"("website_id", "fingerprint");

-- CreateIndex
CREATE INDEX "error_event_website_id_created_at_idx" ON "error_event"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "error_event_error_group_id_created_at_idx" ON "error_event"("error_group_id", "created_at");

-- CreateIndex
CREATE INDEX "error_event_website_id_distinct_id_idx" ON "error_event"("website_id", "distinct_id");

-- CreateIndex
CREATE INDEX "error_event_session_id_idx" ON "error_event"("session_id");
