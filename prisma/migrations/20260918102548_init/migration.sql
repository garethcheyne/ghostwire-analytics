-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN DEFAULT false,
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    "impersonatedBy" TEXT,
    "activeOrganizationId" TEXT,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "accessCode" TEXT,
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" UUID NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "referenceId" TEXT NOT NULL,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN DEFAULT true,
    "rateLimitEnabled" BOOLEAN DEFAULT true,
    "rateLimitTimeWindow" INTEGER DEFAULT 86400000,
    "rateLimitMax" INTEGER DEFAULT 10,
    "requestCount" INTEGER DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,
    "metadata" TEXT,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "session_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "browser" VARCHAR(20),
    "os" VARCHAR(20),
    "device" VARCHAR(20),
    "screen" VARCHAR(11),
    "language" VARCHAR(35),
    "country" CHAR(2),
    "region" VARCHAR(20),
    "city" VARCHAR(50),
    "distinct_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "session_link" (
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "distinct_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_link_pkey" PRIMARY KEY ("website_id","distinct_id","session_id")
);

-- CreateTable
CREATE TABLE "website" (
    "website_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "domain" VARCHAR(500),
    "reset_at" TIMESTAMPTZ(6),
    "user_id" UUID,
    "team_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "recorder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "replay_config" JSONB,

    CONSTRAINT "website_pkey" PRIMARY KEY ("website_id")
);

-- CreateTable
CREATE TABLE "website_event" (
    "event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "url_path" VARCHAR(500) NOT NULL,
    "url_query" VARCHAR(500),
    "utm_source" VARCHAR(255),
    "utm_medium" VARCHAR(255),
    "utm_campaign" VARCHAR(255),
    "utm_content" VARCHAR(255),
    "utm_term" VARCHAR(255),
    "referrer_path" VARCHAR(500),
    "referrer_query" VARCHAR(500),
    "referrer_domain" VARCHAR(500),
    "page_title" VARCHAR(500),
    "gclid" VARCHAR(255),
    "fbclid" VARCHAR(255),
    "msclkid" VARCHAR(255),
    "ttclid" VARCHAR(255),
    "li_fat_id" VARCHAR(255),
    "twclid" VARCHAR(255),
    "event_type" INTEGER NOT NULL DEFAULT 1,
    "event_name" VARCHAR(50),
    "tag" VARCHAR(50),
    "hostname" VARCHAR(100),
    "lcp" DECIMAL(10,1),
    "inp" DECIMAL(10,1),
    "cls" DECIMAL(10,4),
    "fcp" DECIMAL(10,1),
    "ttfb" DECIMAL(10,1),

    CONSTRAINT "website_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_data" (
    "event_data_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "website_event_id" UUID NOT NULL,
    "data_key" VARCHAR(500) NOT NULL,
    "string_value" VARCHAR(500),
    "number_value" DECIMAL(19,4),
    "date_value" TIMESTAMPTZ(6),
    "data_type" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_data_pkey" PRIMARY KEY ("event_data_id")
);

-- CreateTable
CREATE TABLE "session_data" (
    "session_data_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "data_key" VARCHAR(500) NOT NULL,
    "string_value" VARCHAR(500),
    "number_value" DECIMAL(19,4),
    "date_value" TIMESTAMPTZ(6),
    "data_type" INTEGER NOT NULL,
    "distinct_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_data_pkey" PRIMARY KEY ("session_data_id")
);

-- CreateTable
CREATE TABLE "report" (
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "annotation" (
    "annotation_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "user_id" UUID,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "annotation_pkey" PRIMARY KEY ("annotation_id")
);

-- CreateTable
CREATE TABLE "segment" (
    "segment_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "segment_pkey" PRIMARY KEY ("segment_id")
);

-- CreateTable
CREATE TABLE "revenue" (
    "revenue_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_name" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "revenue" DECIMAL(19,4),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_pkey" PRIMARY KEY ("revenue_id")
);

-- CreateTable
CREATE TABLE "link" (
    "link_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "link_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "pixel" (
    "pixel_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pixel_pkey" PRIMARY KEY ("pixel_id")
);

-- CreateTable
CREATE TABLE "board" (
    "board_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "parameters" JSONB NOT NULL,
    "user_id" UUID,
    "team_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "board_pkey" PRIMARY KEY ("board_id")
);

-- CreateTable
CREATE TABLE "share" (
    "share_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "share_type" INTEGER NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "share_pkey" PRIMARY KEY ("share_id")
);

-- CreateTable
CREATE TABLE "session_replay" (
    "replay_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "events" BYTEA NOT NULL,
    "event_count" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_replay_pkey" PRIMARY KEY ("replay_id")
);

-- CreateTable
CREATE TABLE "session_replay_saved" (
    "saved_replay_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "website_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_replay_saved_pkey" PRIMARY KEY ("saved_replay_id")
);

-- CreateTable
CREATE TABLE "heatmap_event" (
    "heatmap_event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "url_path" VARCHAR(500) NOT NULL,
    "event_type" INTEGER NOT NULL,
    "x" INTEGER,
    "y" INTEGER,
    "page_x" INTEGER,
    "page_y" INTEGER,
    "page_w" INTEGER,
    "viewport_w" INTEGER,
    "viewport_h" INTEGER,
    "page_h" INTEGER,
    "scroll_pct" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heatmap_event_pkey" PRIMARY KEY ("heatmap_event_id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "auth_session_userId_idx" ON "auth_session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_accessCode_key" ON "organization"("accessCode");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- CreateIndex
CREATE INDEX "two_factor_secret_idx" ON "two_factor"("secret");

-- CreateIndex
CREATE INDEX "two_factor_userId_idx" ON "two_factor"("userId");

-- CreateIndex
CREATE INDEX "api_key_configId_idx" ON "api_key"("configId");

-- CreateIndex
CREATE INDEX "api_key_referenceId_idx" ON "api_key"("referenceId");

-- CreateIndex
CREATE INDEX "api_key_key_idx" ON "api_key"("key");

-- CreateIndex
CREATE INDEX "session_created_at_idx" ON "session"("created_at");

-- CreateIndex
CREATE INDEX "session_website_id_idx" ON "session"("website_id");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_idx" ON "session"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_browser_idx" ON "session"("website_id", "created_at", "browser");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_os_idx" ON "session"("website_id", "created_at", "os");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_device_idx" ON "session"("website_id", "created_at", "device");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_screen_idx" ON "session"("website_id", "created_at", "screen");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_language_idx" ON "session"("website_id", "created_at", "language");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_country_idx" ON "session"("website_id", "created_at", "country");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_region_idx" ON "session"("website_id", "created_at", "region");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_city_idx" ON "session"("website_id", "created_at", "city");

-- CreateIndex
CREATE INDEX "session_link_website_id_session_id_idx" ON "session_link"("website_id", "session_id");

-- CreateIndex
CREATE INDEX "website_user_id_idx" ON "website"("user_id");

-- CreateIndex
CREATE INDEX "website_team_id_idx" ON "website"("team_id");

-- CreateIndex
CREATE INDEX "website_created_at_idx" ON "website"("created_at");

-- CreateIndex
CREATE INDEX "website_created_by_idx" ON "website"("created_by");

-- CreateIndex
CREATE INDEX "website_event_created_at_idx" ON "website_event"("created_at");

-- CreateIndex
CREATE INDEX "website_event_session_id_idx" ON "website_event"("session_id");

-- CreateIndex
CREATE INDEX "website_event_visit_id_idx" ON "website_event"("visit_id");

-- CreateIndex
CREATE INDEX "website_event_website_id_idx" ON "website_event"("website_id");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_idx" ON "website_event"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_url_path_idx" ON "website_event"("website_id", "created_at", "url_path");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_url_query_idx" ON "website_event"("website_id", "created_at", "url_query");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_referrer_domain_idx" ON "website_event"("website_id", "created_at", "referrer_domain");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_page_title_idx" ON "website_event"("website_id", "created_at", "page_title");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_event_name_idx" ON "website_event"("website_id", "created_at", "event_name");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_tag_idx" ON "website_event"("website_id", "created_at", "tag");

-- CreateIndex
CREATE INDEX "website_event_website_id_session_id_created_at_idx" ON "website_event"("website_id", "session_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_visit_id_created_at_idx" ON "website_event"("website_id", "visit_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_hostname_idx" ON "website_event"("website_id", "created_at", "hostname");

-- CreateIndex
CREATE INDEX "event_data_created_at_idx" ON "event_data"("created_at");

-- CreateIndex
CREATE INDEX "event_data_website_id_idx" ON "event_data"("website_id");

-- CreateIndex
CREATE INDEX "event_data_website_event_id_idx" ON "event_data"("website_event_id");

-- CreateIndex
CREATE INDEX "event_data_website_id_created_at_idx" ON "event_data"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "event_data_website_id_created_at_data_key_idx" ON "event_data"("website_id", "created_at", "data_key");

-- CreateIndex
CREATE INDEX "session_data_created_at_idx" ON "session_data"("created_at");

-- CreateIndex
CREATE INDEX "session_data_website_id_idx" ON "session_data"("website_id");

-- CreateIndex
CREATE INDEX "session_data_session_id_idx" ON "session_data"("session_id");

-- CreateIndex
CREATE INDEX "session_data_session_id_created_at_idx" ON "session_data"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "session_data_website_id_created_at_data_key_idx" ON "session_data"("website_id", "created_at", "data_key");

-- CreateIndex
CREATE UNIQUE INDEX "session_data_session_id_data_key_key" ON "session_data"("session_id", "data_key");

-- CreateIndex
CREATE INDEX "report_user_id_idx" ON "report"("user_id");

-- CreateIndex
CREATE INDEX "report_website_id_idx" ON "report"("website_id");

-- CreateIndex
CREATE INDEX "report_type_idx" ON "report"("type");

-- CreateIndex
CREATE INDEX "report_name_idx" ON "report"("name");

-- CreateIndex
CREATE INDEX "annotation_website_id_date_idx" ON "annotation"("website_id", "date");

-- CreateIndex
CREATE INDEX "segment_website_id_idx" ON "segment"("website_id");

-- CreateIndex
CREATE INDEX "revenue_website_id_idx" ON "revenue"("website_id");

-- CreateIndex
CREATE INDEX "revenue_session_id_idx" ON "revenue"("session_id");

-- CreateIndex
CREATE INDEX "revenue_website_id_created_at_idx" ON "revenue"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "revenue_website_id_session_id_created_at_idx" ON "revenue"("website_id", "session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "link_slug_key" ON "link"("slug");

-- CreateIndex
CREATE INDEX "link_slug_idx" ON "link"("slug");

-- CreateIndex
CREATE INDEX "link_user_id_idx" ON "link"("user_id");

-- CreateIndex
CREATE INDEX "link_team_id_idx" ON "link"("team_id");

-- CreateIndex
CREATE INDEX "link_created_at_idx" ON "link"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pixel_slug_key" ON "pixel"("slug");

-- CreateIndex
CREATE INDEX "pixel_slug_idx" ON "pixel"("slug");

-- CreateIndex
CREATE INDEX "pixel_user_id_idx" ON "pixel"("user_id");

-- CreateIndex
CREATE INDEX "pixel_team_id_idx" ON "pixel"("team_id");

-- CreateIndex
CREATE INDEX "pixel_created_at_idx" ON "pixel"("created_at");

-- CreateIndex
CREATE INDEX "board_user_id_idx" ON "board"("user_id");

-- CreateIndex
CREATE INDEX "board_team_id_idx" ON "board"("team_id");

-- CreateIndex
CREATE INDEX "board_created_at_idx" ON "board"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_slug_key" ON "share"("slug");

-- CreateIndex
CREATE INDEX "share_entity_id_idx" ON "share"("entity_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_idx" ON "session_replay"("website_id");

-- CreateIndex
CREATE INDEX "session_replay_session_id_idx" ON "session_replay"("session_id");

-- CreateIndex
CREATE INDEX "session_replay_visit_id_idx" ON "session_replay"("visit_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_session_id_idx" ON "session_replay"("website_id", "session_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_visit_id_idx" ON "session_replay"("website_id", "visit_id");

-- CreateIndex
CREATE INDEX "session_replay_website_id_created_at_idx" ON "session_replay"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "session_replay_session_id_chunk_index_idx" ON "session_replay"("session_id", "chunk_index");

-- CreateIndex
CREATE INDEX "session_replay_saved_website_id_idx" ON "session_replay_saved"("website_id");

-- CreateIndex
CREATE INDEX "session_replay_saved_visit_id_idx" ON "session_replay_saved"("visit_id");

-- CreateIndex
CREATE INDEX "session_replay_saved_website_id_created_at_idx" ON "session_replay_saved"("website_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_replay_saved_website_id_visit_id_key" ON "session_replay_saved"("website_id", "visit_id");

-- CreateIndex
CREATE INDEX "heatmap_event_website_id_idx" ON "heatmap_event"("website_id");

-- CreateIndex
CREATE INDEX "heatmap_event_visit_id_idx" ON "heatmap_event"("visit_id");

-- CreateIndex
CREATE INDEX "heatmap_event_website_id_created_at_idx" ON "heatmap_event"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "heatmap_event_website_id_url_path_event_type_created_at_idx" ON "heatmap_event"("website_id", "url_path", "event_type", "created_at");
