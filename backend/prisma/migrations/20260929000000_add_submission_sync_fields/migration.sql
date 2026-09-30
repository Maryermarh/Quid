-- Submission sync (#310).
-- tx_hash: hash of the hunter's submit_feedback transaction, sent with the
--          optional optimistic POST /missions/:id/submissions.
-- chain_confirmed: set by the indexer once the submission is seen on chain.
ALTER TABLE "submissions" ADD COLUMN "tx_hash" TEXT;
ALTER TABLE "submissions" ADD COLUMN "chain_confirmed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tx_hash_key" ON "submissions"("tx_hash");
