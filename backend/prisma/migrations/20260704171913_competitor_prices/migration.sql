-- CreateTable
CREATE TABLE "CompetitorProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "price" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorProduct_brandId_idx" ON "CompetitorProduct"("brandId");

-- CreateIndex
CREATE INDEX "CompetitorProduct_tenantId_idx" ON "CompetitorProduct"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorProduct_brandId_name_key" ON "CompetitorProduct"("brandId", "name");

-- CreateIndex
CREATE INDEX "PricePoint_productId_capturedAt_idx" ON "PricePoint"("productId", "capturedAt");

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CompetitorProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
