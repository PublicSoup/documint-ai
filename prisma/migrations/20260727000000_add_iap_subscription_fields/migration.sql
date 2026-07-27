-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "iapPlatform" TEXT,
ADD COLUMN     "iapProductId" TEXT,
ADD COLUMN     "iapOriginalTransactionId" TEXT,
ADD COLUMN     "iapPurchaseToken" TEXT,
ADD COLUMN     "iapExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_iapOriginalTransactionId_key" ON "Subscription"("iapOriginalTransactionId");
