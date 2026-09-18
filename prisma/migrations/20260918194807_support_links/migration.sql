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
CREATE TABLE "support_link" (
    "support_link_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "distinct_id" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "include_replays" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(200),
    "created_by" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_link_pkey" PRIMARY KEY ("support_link_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_link_slug_key" ON "support_link"("slug");

-- CreateIndex
CREATE INDEX "support_link_website_id_distinct_id_idx" ON "support_link"("website_id", "distinct_id");
