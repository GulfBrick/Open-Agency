-- Open Agency — Initial Migration
-- Creates all tables per the master schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "Client" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "whopUserId"   TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "tier"         TEXT NOT NULL,
    "brief"        TEXT,
    "timezone"     TEXT NOT NULL DEFAULT 'UTC',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_whopUserId_key" ON "Client"("whopUserId");
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

CREATE TABLE "ClientAgent" (
    "id"       TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientId" TEXT NOT NULL,
    "agentId"  TEXT NOT NULL,
    "level"    INTEGER NOT NULL DEFAULT 1,
    "xp"       INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ClientAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientId"    TEXT NOT NULL,
    "agentId"     TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "input"       JSONB,
    "output"      JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Report" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientId"  TEXT NOT NULL,
    "agentId"   TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Integration" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientId"       TEXT NOT NULL,
    "githubToken"    TEXT,
    "gitlabToken"    TEXT,
    "bitbucketToken" TEXT,
    "githubRepo"     TEXT,
    "gitlabRepo"     TEXT,
    "bitbucketRepo"  TEXT,
    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Integration_clientId_key" ON "Integration"("clientId");

CREATE TABLE "Message" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientId"  TEXT NOT NULL,
    "role"      TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientId"  TEXT NOT NULL,
    "agentId"   TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "detail"    JSONB,
    "ip"        TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "ClientAgent" ADD CONSTRAINT "ClientAgent_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Integration" ADD CONSTRAINT "Integration_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Useful indexes
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Report_clientId_idx" ON "Report"("clientId");
CREATE INDEX "Message_clientId_idx" ON "Message"("clientId");
CREATE INDEX "AuditLog_clientId_idx" ON "AuditLog"("clientId");
CREATE INDEX "ClientAgent_clientId_idx" ON "ClientAgent"("clientId");
