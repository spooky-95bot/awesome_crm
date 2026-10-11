-- Ajout de la clé d'idempotence pour les réservations Elysence
-- Un même reservationId ne peut créer qu'un seul lead.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "reservationKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_reservationKey_key" ON "Lead"("reservationKey") WHERE "reservationKey" IS NOT NULL;
