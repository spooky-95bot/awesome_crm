-- CreateTable
CREATE TABLE "SavedAd" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "brandId" TEXT NOT NULL,
    "adArchiveId" TEXT NOT NULL,
    "pageName" TEXT,
    "body" TEXT,
    "snapshotUrl" TEXT,
    "startTime" TEXT,
    "platforms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedAd_brandId_idx" ON "SavedAd"("brandId");

-- CreateIndex
CREATE INDEX "SavedAd_tenantId_idx" ON "SavedAd"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedAd_brandId_adArchiveId_key" ON "SavedAd"("brandId", "adArchiveId");
