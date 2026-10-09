-- Indique si les prix unitaires saisis sont TTC (prix affichés Elysence).
ALTER TABLE "Invoice" ADD COLUMN "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false;
