-- Devise par défaut : TRY -> EUR (projet Elysence, France)
ALTER TABLE "Invoice"           ALTER COLUMN "currency" SET DEFAULT 'EUR';
ALTER TABLE "Deal"              ALTER COLUMN "currency" SET DEFAULT 'EUR';
ALTER TABLE "Product"           ALTER COLUMN "currency" SET DEFAULT 'EUR';
ALTER TABLE "Quote"             ALTER COLUMN "currency" SET DEFAULT 'EUR';
ALTER TABLE "CompetitorProduct" ALTER COLUMN "currency" SET DEFAULT 'EUR';
ALTER TABLE "PaymentIntent"     ALTER COLUMN "currency" SET DEFAULT 'EUR';
