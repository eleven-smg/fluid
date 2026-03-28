# Transaction Logging Flow Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Fee-Bump Request Received                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Validate XDR & Check Quota                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Extract innerTxHash from Transaction                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         CREATE Transaction Record (status: PENDING)              │
│  - innerTxHash: <hash>                                          │
│  - tenantId: <tenant-id>                                        │
│  - costStroops: <fee-amount>                                    │
│  - txHash: null                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────┴────────┐
                    │   Try Block     │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Build & Sign Fee-Bump Transaction                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────┴────────┐
                    │  Submit = true? │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
               YES                       NO
                │                         │
                ▼                         ▼
    ┌───────────────────────┐  ┌──────────────────────┐
    │ Submit to Horizon     │  │ Return XDR only      │
    └───────┬───────────────┘  └──────┬───────────────┘
            │                         │
            ▼                         ▼
    ┌───────────────────┐    ┌────────────────────┐
    │ Submission        │    │ UPDATE Transaction │
    │ Successful?       │    │ - status: SUCCESS  │
    └───────┬───────────┘    │ - txHash: <hash>   │
            │                └────────────────────┘
    ┌───────┴───────┐
    │               │
   YES             NO
    │               │
    ▼               ▼
┌─────────────┐  ┌──────────────┐
│UPDATE Trans │  │UPDATE Trans  │
│status:      │  │status: FAILED│
│SUCCESS      │  └──────────────┘
│txHash:<hash>│
└─────────────┘
                             │
                             ▼
                    ┌────────┴────────┐
                    │  Catch Block    │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         UPDATE Transaction Record (status: FAILED)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Throw Error                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Database State Transitions

```
┌──────────┐
│  START   │
└────┬─────┘
     │
     │ CREATE record
     ▼
┌──────────┐
│ PENDING  │ ◄─── Initial state when transaction processing begins
└────┬─────┘
     │
     │ UPDATE on success
     ├─────────────────────┐
     │                     │
     ▼                     ▼
┌──────────┐         ┌──────────┐
│ SUCCESS  │         │  FAILED  │ ◄─── Updated on any error
└──────────┘         └──────────┘
     │                     │
     │                     │
     ▼                     ▼
┌──────────────────────────────┐
│   Permanent State            │
│   (No further updates)       │
└──────────────────────────────┘
```

## Code Execution Timeline

```
Time  │  Action                              │  Database State
──────┼──────────────────────────────────────┼─────────────────────
  0   │  Request received                    │  -
  1   │  Validate XDR                        │  -
  2   │  Check quota                         │  -
  3   │  Extract innerTxHash                 │  -
  4   │  prisma.transaction.create()         │  PENDING
  5   │  Build fee-bump transaction          │  PENDING
  6   │  Sign transaction                    │  PENDING
  7   │  Record sponsored transaction        │  PENDING
  8   │  Submit to Horizon (if submit=true)  │  PENDING
  9a  │  prisma.transaction.update()         │  SUCCESS ✓
  9b  │  OR prisma.transaction.update()      │  FAILED ✗
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Any Error Occurs                              │
│  - Invalid XDR                                                   │
│  - Unsigned transaction                                          │
│  - Already fee-bumped                                            │
│  - Quota exceeded                                                │
│  - Build failure                                                 │
│  - Submission failure                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Catch Block Executes                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         UPDATE Transaction (status: FAILED)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Re-throw Error (for API response)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────────┐
│ API Request  │
│  - xdr       │
│  - submit    │
│  - token     │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Inner Transaction│
│  - operations    │
│  - signatures    │
│  - hash ────────┼──► innerTxHash
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Fee Calculation  │
│  - baseFee       │
│  - multiplier    │
│  - operations    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐      ┌─────────────────────┐
│ Transaction      │      │ Database Record     │
│ Record Created   │─────►│  id: uuid           │
│                  │      │  innerTxHash: hash  │
│                  │      │  tenantId: id       │
│                  │      │  status: PENDING    │
│                  │      │  costStroops: fee   │
│                  │      │  txHash: null       │
└──────┬───────────┘      └─────────────────────┘
       │
       ▼
┌──────────────────┐
│ Fee-Bump Tx      │
│  - innerTx       │
│  - feePayer      │
│  - signature     │
│  - hash ────────┼──► txHash (on success)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐      ┌─────────────────────┐
│ Update Record    │      │ Database Record     │
│ with Result      │─────►│  status: SUCCESS    │
│                  │      │  txHash: hash       │
└──────────────────┘      └─────────────────────┘
```

## Query Patterns

### By Tenant
```
┌──────────────┐
│ tenantId     │
│ (indexed)    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│ All transactions for     │
│ specific tenant          │
│ - Cost analytics         │
│ - Usage patterns         │
│ - Success rate           │
└──────────────────────────┘
```

### By Status
```
┌──────────────┐
│ status       │
│ (indexed)    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│ Filter by status         │
│ - PENDING: In progress   │
│ - SUCCESS: Completed     │
│ - FAILED: Errors         │
└──────────────────────────┘
```

### By Transaction Hash
```
┌──────────────┐
│ txHash       │
│ (indexed)    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│ Lookup specific          │
│ transaction              │
│ - Audit trail            │
│ - Debugging              │
└──────────────────────────┘
```

## Benefits Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                     Transaction Table                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Auditing │  │Analytics │  │Debugging │  │ Billing  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │               │
│       ▼             ▼             ▼             ▼               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ Complete history of all fee-bump transactions       │       │
│  │ - Who: tenantId                                     │       │
│  │ - What: innerTxHash, txHash                         │       │
│  │ - When: createdAt                                   │       │
│  │ - How much: costStroops                             │       │
│  │ - Result: status                                    │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
