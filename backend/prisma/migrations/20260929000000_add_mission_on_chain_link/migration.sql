ALTER TABLE "missions"
ADD COLUMN "on_chain_id" TEXT,
ADD COLUMN "indexed_from_chain" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "missions_on_chain_id_key"
ON "missions"("on_chain_id");

ALTER TABLE "mission_drafts"
ADD COLUMN "published_at" TIMESTAMP(3),
ADD COLUMN "published_mission_id" TEXT;

CREATE UNIQUE INDEX "mission_drafts_published_mission_id_key"
ON "mission_drafts"("published_mission_id");
