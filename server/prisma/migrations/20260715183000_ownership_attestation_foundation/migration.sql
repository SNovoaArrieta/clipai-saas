-- CreateEnum
CREATE TYPE "AuthorizationBasis" AS ENUM ('owner', 'authorized_by_owner');

-- AlterTable
ALTER TABLE "Workspace"
ADD CONSTRAINT "Workspace_id_ownerUserId_key" UNIQUE ("id", "ownerUserId");

-- CreateTable
CREATE TABLE "OwnershipAttestation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "statementVersion" VARCHAR(32) NOT NULL,
    "authorizationBasis" "AuthorizationBasis" NOT NULL,
    "attestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createIdempotencyKey" VARCHAR(255) NOT NULL,

    CONSTRAINT "OwnershipAttestation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OwnershipAttestation_statementVersion_check"
      CHECK ("statementVersion" = 'ownership-v1')
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipAttestation_workspaceId_createIdempotencyKey_key"
ON "OwnershipAttestation"("workspaceId", "createIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipAttestation_sourceId_statementVersion_key"
ON "OwnershipAttestation"("sourceId", "statementVersion");

-- AddForeignKey
ALTER TABLE "OwnershipAttestation"
ADD CONSTRAINT "OwnershipAttestation_sourceId_workspaceId_projectId_fkey"
FOREIGN KEY ("sourceId", "workspaceId", "projectId")
REFERENCES "Source"("id", "workspaceId", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipAttestation"
ADD CONSTRAINT "OwnershipAttestation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipAttestation"
ADD CONSTRAINT "OwnershipAttestation_workspaceId_userId_fkey"
FOREIGN KEY ("workspaceId", "userId")
REFERENCES "Workspace"("id", "ownerUserId")
ON DELETE RESTRICT ON UPDATE CASCADE;
