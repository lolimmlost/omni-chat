CREATE TYPE "public"."session_status" AS ENUM('active', 'waiting_human', 'waiting_ai', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('visitor', 'admin', 'ai', 'system');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"admin_socket_id" text,
	"visitor_info" jsonb,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"feedback_rating" integer,
	"feedback_comment" text,
	"feedback_submitted_at" timestamp with time zone,
	"flagged" integer DEFAULT 0,
	"flagged_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered" integer DEFAULT 1 NOT NULL,
	"seen" integer DEFAULT 0 NOT NULL,
	"seen_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "page_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"session_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"key_topics" jsonb DEFAULT '[]'::jsonb,
	"sentiment" "sentiment" DEFAULT 'neutral',
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_count" integer NOT NULL,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"session_id" text,
	"site_id" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"ai_provider" text DEFAULT 'ollama' NOT NULL,
	"ai_model" text DEFAULT 'llama3.2' NOT NULL,
	"context_file" text,
	"features" jsonb DEFAULT '{"aiEnabled":true,"conversationMemory":true,"contentFiltering":false,"webhooks":true}'::jsonb NOT NULL,
	"webhooks" jsonb DEFAULT '{"url":"","events":[]}'::jsonb,
	"branding" jsonb DEFAULT '{"name":"Support Chat","color":"#00d9ff"}'::jsonb,
	"response_settings" jsonb DEFAULT '{"temperature":0.7,"maxTokens":500,"systemPromptPrefix":""}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canned_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"category" text DEFAULT 'general',
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_site_status" ON "sessions" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "idx_created_at" ON "sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_status" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_session_timestamp" ON "messages" USING btree ("session_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_session_id" ON "messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_page_visits_session_timestamp" ON "page_visits" USING btree ("session_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_event_type_timestamp" ON "analytics_events" USING btree ("event_type","timestamp");--> statement-breakpoint
CREATE INDEX "idx_site_timestamp" ON "analytics_events" USING btree ("site_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_analytics_timestamp" ON "analytics_events" USING btree ("timestamp");