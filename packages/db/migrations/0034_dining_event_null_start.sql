ALTER TABLE "dining_event" DROP CONSTRAINT "dining_event_pk";--> statement-breakpoint
ALTER TABLE "dining_event" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_event" ALTER COLUMN "start" DROP NOT NULL;
CREATE UNIQUE INDEX "dining_event_restaurant_id_title_index" ON "dining_event" USING btree ("restaurant_id","title") WHERE "dining_event"."start" is null;
CREATE UNIQUE INDEX "dining_event_restaurant_id_start_end_index" ON "dining_event" USING btree("restaurant_id", "start", "end") NULLS NOT DISTINCT WHERE "dining_event"."start" is not null;