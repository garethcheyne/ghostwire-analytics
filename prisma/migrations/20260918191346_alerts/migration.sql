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
CREATE TABLE "notification_channel" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_channel_pkey" PRIMARY KEY ("channel_id")
);

-- CreateTable
CREATE TABLE "alert_rule" (
    "alert_rule_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channel_ids" UUID[],
    "parameters" JSONB,
    "last_triggered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_rule_pkey" PRIMARY KEY ("alert_rule_id")
);

-- CreateTable
CREATE TABLE "alert_log" (
    "alert_log_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "alert_rule_id" UUID NOT NULL,
    "channel_id" UUID,
    "type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_log_pkey" PRIMARY KEY ("alert_log_id")
);

-- CreateIndex
CREATE INDEX "notification_channel_user_id_idx" ON "notification_channel"("user_id");

-- CreateIndex
CREATE INDEX "notification_channel_team_id_idx" ON "notification_channel"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_website_id_type_key" ON "alert_rule"("website_id", "type");

-- CreateIndex
CREATE INDEX "alert_log_website_id_created_at_idx" ON "alert_log"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_log_alert_rule_id_created_at_idx" ON "alert_log"("alert_rule_id", "created_at");
