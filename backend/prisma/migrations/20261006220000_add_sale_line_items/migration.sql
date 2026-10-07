-- Add productId to InvoiceLineItem for product tracking
ALTER TABLE "InvoiceLineItem" ADD COLUMN "productId" TEXT;

-- Add foreign key constraint
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index
CREATE INDEX "InvoiceLineItem_productId_idx" ON "InvoiceLineItem"("productId");

-- Create SaleLineItem model for deals
CREATE TABLE "SaleLineItem" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "productId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleLineItem_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "SaleLineItem_dealId_idx" ON "SaleLineItem"("dealId");
CREATE INDEX "SaleLineItem_productId_idx" ON "SaleLineItem"("productId");
