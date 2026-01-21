CREATE TABLE "api_keys" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"model" varchar(50) NOT NULL,
	"token_limit_per_day" integer NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used" timestamp,
	"total_lifetime_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "daily_usage" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"api_key_id" varchar(26) NOT NULL,
	"date" timestamp NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_key" ON "api_keys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_daily_usage_date" ON "daily_usage" USING btree ("api_key_id","date");