ALTER TABLE "lots" ADD COLUMN "listed_at" timestamp;--> statement-breakpoint
ALTER TABLE "seller_prospects" ADD COLUMN "agreement_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "lots_listed_at_idx" ON "lots" USING btree ("listed_at");--> statement-breakpoint
ALTER TABLE "seller_prospects" ADD CONSTRAINT "seller_prospects_agreement_token_unique" UNIQUE("agreement_token");--> statement-breakpoint
-- listed_at is stamped here rather than in application code: lots reach the
-- public catalogue through many paths (lot editor, gallery relist, sale
-- opening, prospect intake), and the saved-search alerts must see all of them.
CREATE OR REPLACE FUNCTION "lots_stamp_listed_at"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."listed_at" IS NULL AND NEW."status" IN ('for_sale', 'in_auction') THEN
    NEW."listed_at" := now();
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "lots_stamp_listed_at" BEFORE INSERT OR UPDATE OF "status" ON "lots"
  FOR EACH ROW EXECUTE FUNCTION "lots_stamp_listed_at"();--> statement-breakpoint
-- Lots already public keep their creation time, so no saved search re-alerts
-- on them.
UPDATE "lots" SET "listed_at" = coalesce("created_at", now())
WHERE "listed_at" IS NULL AND "status" IN ('for_sale', 'in_auction', 'sold', 'unsold');
