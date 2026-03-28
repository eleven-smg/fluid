# Transaction History Logging Implementation

## Overview

This document describes the implementation of a global logging system that records every fee-bump transaction in the database for auditing and analytics purposes.

## Database Schema

### Transaction Model

The `Transaction` model tracks all fee-bump transactions with the following fields:

```prisma
model Transaction {
  id          String   @id @default(uuid())
  txHash      String?  // The hash of the fee-bump transaction
  innerTxHash String   // The hash of the original transaction
  tenantId    String
  status      String   // PENDING, SUCCESS, FAILED
  costStroops BigInt
  createdAt   DateTime @default(now())

  @@index([tenantId])
  @@index([status])
  @@index([txHash])
}
```

### Field Descriptions

- `id`: Unique identifier for the transaction record
- `txHash`: Hash of the fee-bumped transaction (nullable, set after submission)
- `innerTxHash`: Hash of the original transaction before fee-bumping
- `tenantId`: ID of the tenant who initiated the transaction
- `status`: Current status of the transaction (PENDING, SUCCESS, FAILED)
- `costStroops`: Fee amount in stroops charged for the transaction
- `createdAt`: Timestamp when the record was created

### Indexes

Three indexes are created for efficient querying:
- `tenantId`: For tenant-specific transaction lookups
- `status`: For filtering by transaction status
- `txHash`: For looking up transactions by their hash

## Application Logic

### Transaction Lifecycle

The `processFeeBump` function in `server/src/handlers/feeBump.ts` has been updated to log transactions through their entire lifecycle:

1. **PENDING**: Record is created at the start of processing
   - Created immediately after quota validation
   - Contains `innerTxHash`, `tenantId`, `costStroops`
   - `txHash` is null at this stage

2. **SUCCESS**: Record is updated when transaction is built/submitted successfully
   - `txHash` is set to the fee-bump transaction hash
   - Status updated to SUCCESS

3. **FAILED**: Record is updated if any error occurs
   - Status updated to FAILED
   - Original error is still thrown for proper error handling

### Code Flow

```typescript
// 1. Create PENDING record
const transactionRecord = await prisma.transaction.create({
  data: {
    innerTxHash,
    tenantId: tenant.id,
    status: "PENDING",
    costStroops: feeAmount,
  },
});

try {
  // 2. Build and sign fee-bump transaction
  const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(...);
  
  if (submit) {
    // 3a. Submit and update to SUCCESS
    const submissionResult = await server.submitTransaction(feeBumpTx);
    await prisma.transaction.update({
      where: { id: transactionRecord.id },
      data: { status: "SUCCESS", txHash: submissionResult.hash },
    });
  } else {
    // 3b. Update to SUCCESS without submission
    await prisma.transaction.update({
      where: { id: transactionRecord.id },
      data: { status: "SUCCESS", txHash: feeBumpTxHash },
    });
  }
} catch (error) {
  // 4. Update to FAILED on error
  await prisma.transaction.update({
    where: { id: transactionRecord.id },
    data: { status: "FAILED" },
  });
  throw error;
}
```

## Migration

The database migration is located at:
```
server/prisma/migrations/20260328120000_add_transaction_logging/migration.sql
```

To apply the migration:
```bash
cd server
npm run db:migrate:deploy
```

Or for development:
```bash
cd server
npm run db:migrate
```

## Verification

### Automated Testing

Run existing fee-bump tests to ensure no regressions:
```bash
cd server
npm test
```

### Manual Verification

1. **Trigger a fee-bump transaction:**
   ```bash
   cd server
   ts-node scripts/testFeeBump.ts
   ```

2. **Verify transaction logging:**
   ```bash
   cd server
   ts-node scripts/verifyTransactionLogging.ts
   ```

   This script will:
   - Count total transactions in the database
   - Display the 10 most recent transactions
   - Group transactions by status
   - Group transactions by tenant

3. **Query the database directly:**
   ```bash
   cd server
   npx prisma studio
   ```
   
   Then navigate to the `Transaction` table to view all records.

### Expected Output

After running `testFeeBump.ts`, you should see:
- A new record in the `Transaction` table
- Status: `SUCCESS` (if submission succeeded) or `FAILED` (if it failed)
- `txHash`: Populated with the fee-bump transaction hash
- `innerTxHash`: Hash of the original transaction
- `costStroops`: Fee amount charged
- `tenantId`: ID of the test tenant

## Analytics Queries

### Get transaction count by status
```typescript
const statusCounts = await prisma.transaction.groupBy({
  by: ["status"],
  _count: true,
});
```

### Get total cost by tenant
```typescript
const tenantCosts = await prisma.transaction.groupBy({
  by: ["tenantId"],
  _sum: { costStroops: true },
});
```

### Get failed transactions
```typescript
const failedTxs = await prisma.transaction.findMany({
  where: { status: "FAILED" },
  orderBy: { createdAt: "desc" },
});
```

### Get transactions for a specific tenant
```typescript
const tenantTxs = await prisma.transaction.findMany({
  where: { tenantId: "tenant-id-here" },
  orderBy: { createdAt: "desc" },
});
```

## Benefits

1. **Auditing**: Complete history of all fee-bump transactions
2. **Analytics**: Track usage patterns, costs, and success rates
3. **Debugging**: Identify failed transactions and their causes
4. **Billing**: Accurate cost tracking per tenant
5. **Monitoring**: Real-time visibility into transaction processing

## Future Enhancements

Potential improvements to consider:
- Add error message field to capture failure reasons
- Add processing time metrics
- Add retry count for failed transactions
- Create dashboard views for transaction analytics
- Set up alerts for high failure rates
