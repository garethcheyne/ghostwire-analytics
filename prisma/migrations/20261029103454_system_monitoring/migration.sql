-- AlterTable
ALTER TABLE "website" ADD COLUMN     "monitor_hour_days" INTEGER NOT NULL DEFAULT 396,
ADD COLUMN     "monitor_minute_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "monitor_span_days" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "monitor_service" (
    "service_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "namespace" VARCHAR(100) NOT NULL DEFAULT '',
    "name" VARCHAR(100) NOT NULL,
    "version" VARCHAR(100),
    "environment" VARCHAR(50),
    "language" VARCHAR(30),
    "first_seen" TIMESTAMPTZ(6) NOT NULL,
    "last_seen" TIMESTAMPTZ(6) NOT NULL,
    "last_metrics_at" TIMESTAMPTZ(6),
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "interval_seconds" INTEGER,

    CONSTRAINT "monitor_service_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "monitor_metric_minute" (
    "website_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "metric" VARCHAR(150) NOT NULL,
    "attrs_hash" VARCHAR(16) NOT NULL,
    "bucket" TIMESTAMPTZ(6) NOT NULL,
    "kind" SMALLINT NOT NULL,
    "unit" VARCHAR(30),
    "attrs" JSONB NOT NULL,
    "count" BIGINT NOT NULL DEFAULT 0,
    "sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "last" DOUBLE PRECISION,
    "bounds" DOUBLE PRECISION[],
    "buckets" BIGINT[],

    CONSTRAINT "monitor_metric_minute_pkey" PRIMARY KEY ("website_id","service_id","metric","attrs_hash","bucket")
);

-- CreateTable
CREATE TABLE "monitor_metric_hour" (
    "website_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "metric" VARCHAR(150) NOT NULL,
    "attrs_hash" VARCHAR(16) NOT NULL,
    "bucket" TIMESTAMPTZ(6) NOT NULL,
    "kind" SMALLINT NOT NULL,
    "unit" VARCHAR(30),
    "attrs" JSONB NOT NULL,
    "count" BIGINT NOT NULL DEFAULT 0,
    "sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "last" DOUBLE PRECISION,
    "bounds" DOUBLE PRECISION[],
    "buckets" BIGINT[],

    CONSTRAINT "monitor_metric_hour_pkey" PRIMARY KEY ("website_id","service_id","metric","attrs_hash","bucket")
);

-- CreateTable
CREATE TABLE "monitor_cumulative" (
    "website_id" UUID NOT NULL,
    "stream" VARCHAR(32) NOT NULL,
    "start_ms" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "count" BIGINT NOT NULL DEFAULT 0,
    "buckets" BIGINT[],
    "seen_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "monitor_cumulative_pkey" PRIMARY KEY ("website_id","stream")
);

-- CreateTable
CREATE TABLE "monitor_span" (
    "website_id" UUID NOT NULL,
    "trace_id" VARCHAR(32) NOT NULL,
    "span_id" VARCHAR(16) NOT NULL,
    "parent_span_id" VARCHAR(16),
    "service_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" SMALLINT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "duration_ms" DOUBLE PRECISION NOT NULL,
    "status" SMALLINT NOT NULL,
    "status_message" VARCHAR(500),
    "is_entry" BOOLEAN NOT NULL,
    "route" VARCHAR(200),
    "http_method" VARCHAR(16),
    "http_status" INTEGER,
    "db_system" VARCHAR(50),
    "peer" VARCHAR(200),
    "db_statement" VARCHAR(1000),
    "attributes" JSONB,
    "events" JSONB,
    "error_group_id" UUID,

    CONSTRAINT "monitor_span_pkey" PRIMARY KEY ("website_id","trace_id","span_id")
);

-- CreateIndex
CREATE INDEX "monitor_service_website_id_last_seen_idx" ON "monitor_service"("website_id", "last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "monitor_service_website_id_namespace_name_key" ON "monitor_service"("website_id", "namespace", "name");

-- CreateIndex
CREATE INDEX "monitor_metric_minute_website_id_metric_bucket_idx" ON "monitor_metric_minute"("website_id", "metric", "bucket");

-- CreateIndex
CREATE INDEX "monitor_metric_minute_website_id_bucket_idx" ON "monitor_metric_minute"("website_id", "bucket");

-- CreateIndex
CREATE INDEX "monitor_metric_hour_website_id_metric_bucket_idx" ON "monitor_metric_hour"("website_id", "metric", "bucket");

-- CreateIndex
CREATE INDEX "monitor_metric_hour_website_id_bucket_idx" ON "monitor_metric_hour"("website_id", "bucket");

-- CreateIndex
CREATE INDEX "monitor_cumulative_seen_at_idx" ON "monitor_cumulative"("seen_at");

-- CreateIndex
CREATE INDEX "monitor_span_website_id_start_time_idx" ON "monitor_span"("website_id", "start_time");

-- CreateIndex
CREATE INDEX "monitor_span_website_id_service_id_start_time_idx" ON "monitor_span"("website_id", "service_id", "start_time");

-- CreateIndex
CREATE INDEX "website_error_key_hash_idx" ON "website"("error_key_hash");

-- Partial indexes Prisma can't declare: the trace list (entry spans), outside calls (client spans)
-- and failing spans, each by website and time.
CREATE INDEX "monitor_span_entry_idx" ON "monitor_span"("website_id", "start_time") WHERE "is_entry";
CREATE INDEX "monitor_span_client_idx" ON "monitor_span"("website_id", "start_time") WHERE "kind" = 3;
CREATE INDEX "monitor_span_error_idx" ON "monitor_span"("website_id", "start_time") WHERE "status" = 2;

-- Element-wise sum of histogram bucket counts: merges a minute's rows on upsert, rolls minutes up
-- into hours, and sums series at query time. Arrays of different lengths (different bucket
-- bounds, which are separate series) keep the first.
CREATE FUNCTION "monitor_array_add"(a BIGINT[], b BIGINT[]) RETURNS BIGINT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN a IS NULL OR cardinality(a) = 0 THEN b
    WHEN b IS NULL OR cardinality(b) = 0 THEN a
    WHEN cardinality(a) <> cardinality(b) THEN a
    ELSE ARRAY(SELECT x + y FROM unnest(a, b) WITH ORDINALITY AS t(x, y, i) ORDER BY i)
  END
$$;

CREATE AGGREGATE "monitor_sum_buckets"(BIGINT[]) (SFUNC = "monitor_array_add", STYPE = BIGINT[]);
