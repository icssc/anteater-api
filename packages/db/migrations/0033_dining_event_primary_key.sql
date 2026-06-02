ALTER TABLE "dining_event" DROP CONSTRAINT "dining_event_pk";--> statement-breakpoint
ALTER TABLE "dining_event" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_event" ALTER COLUMN "start" DROP NOT NULL;
ALTER TABLE "dining_event" ADD CONSTRAINT "dining_event_restaurant_id_start_end_unique" UNIQUE("restaurant_id","start","end");
