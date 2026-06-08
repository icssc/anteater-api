ALTER TABLE "dining_event" DROP CONSTRAINT "dining_event_pk";--> statement-breakpoint
ALTER TABLE "dining_event" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_event" ALTER COLUMN "start" DROP NOT NULL;
CREATE UNIQUE INDEX "dining_event_restaurant_id_start_end_index" ON "dining_event" USING btree ("restaurant_id","start","end");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_event_restaurant_id_title_index" ON "dining_event" USING btree ("restaurant_id","title") WHERE "start" IS NULL;