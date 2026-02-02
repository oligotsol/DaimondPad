# DiamondPad API Documentation

Base URL: `https://api.diamondpad.xyz` (or `http://localhost:3000` for local dev)

## Authentication

Most endpoints are public. Protected endpoints require an API key:

```
Authorization: Bearer YOUR_API_KEY
```

---

## Endpoints

### Health & Info

#### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "diamondpad",
  "version": "0.1.0",
  "timestamp": "2026-02-02T12:00:00.000Z",
  "tagline": "The launchpad that rewards believers, not flippers 💎"
}
```

#### `GET /api/config`
Get platform configuration and multipliers.

**Response:**
```json
{
  "success": true,
  "config": {
    "multipliers": {
      "PAPER": { "maxDays": 7, "multiplier": 1.0 },
      "BRONZE": { "maxDays": 30, "multiplier": 1.5 },
      "SILVER": { "maxDays": 60, "multiplier": 2.0 },
      "GOLD": { "maxDays": 90, "multiplier": 2.5 },
      "PLATINUM": { "maxDays": 180, "multiplier": 3.0 },
      "DIAMOND": { "maxDays": null, "multiplier": 3.5 }
    },
    "maxDevAllocation": 10,
    "minDevVesting": 6,
    "minLiquidityLock": 12,
    "bundleDetectionThreshold": 70
  }
}
```

---

### Launches

#### `POST /api/launch`
Create a new token launch.

**Request Body:**
```json
{
  "name": "MyToken",
  "symbol": "MTK",
  "description": "A token for believers",
  "totalSupply": 1000000000,
  "devAllocation": 5,
  "devVestingMonths": 6,
  "liquidityLockMonths": 12,
  "holderRewardsPool": 10,
  "creatorWallet": "Abc123...",
  "creatorType": "human",
  "agentId": "optional-agent-id"
}
```

**Response:**
```json
{
  "success": true,
  "launch": {
    "id": "launch_1234567890_abc123",
    "mint": "mint_abc123xyz",
    "name": "MyToken",
    "symbol": "MTK",
    "status": "pending"
  }
}
```

#### `GET /api/launch/:id`
Get details for a specific launch.

**Response:**
```json
{
  "success": true,
  "launch": { ... },
  "stats": {
    "totalHolders": 150,
    "diamondHands": 42,
    "avgHoldDays": 23.5
  }
}
```

#### `GET /api/launches`
List all launches.

**Query Parameters:**
- `status` (optional): Filter by status (pending, active, graduated, failed)
- `limit` (optional): Max results (default: 20)

**Response:**
```json
{
  "success": true,
  "count": 12,
  "launches": [ ... ]
}
```

#### `POST /api/launch/:id/activate`
Activate a pending launch (make it live).

**Response:**
```json
{
  "success": true,
  "message": "Launch is now live!",
  "launch": { ... }
}
```

---

### Buying

#### `POST /api/buy`
Record a buy with bundle detection.

**Request Body:**
```json
{
  "launchId": "launch_1234567890_abc123",
  "wallet": "BuyerWallet123...",
  "amount": 1.5,
  "txSignature": "5xYz..."
}
```

**Response:**
```json
{
  "success": true,
  "buy": {
    "wallet": "BuyerWallet123...",
    "amount": 1.5,
    "tokensReceived": 1500000,
    "txSignature": "5xYz..."
  },
  "bundleCheck": {
    "isBundled": false,
    "confidence": 15,
    "action": "none",
    "penalty": null
  },
  "holder": {
    "balance": 1500000,
    "diamondRank": "Paper",
    "multiplier": 1.0
  }
}
```

---

### Holders

#### `GET /api/holder/:wallet`
Get holder status across all launches.

**Query Parameters:**
- `launchId` (optional): Filter to specific launch

**Response:**
```json
{
  "success": true,
  "wallet": "HolderWallet123...",
  "globalScore": 12,
  "holdings": [
    {
      "launch": { "id": "...", "name": "MyToken", "symbol": "MTK" },
      "holder": {
        "balance": 1500000,
        "holdDurationDays": 45,
        "diamondRank": "Silver",
        "diamondMultiplier": 2.0,
        "rewardsAccrued": 30000
      }
    }
  ]
}
```

#### `GET /api/leaderboard`
Get diamond hands leaderboard.

**Query Parameters:**
- `launchId` (optional): Filter to specific launch
- `limit` (optional): Max results (default: 20)

**Response:**
```json
{
  "success": true,
  "launchId": "all",
  "leaderboard": [
    {
      "rank": 1,
      "wallet": "DiamondHands123...",
      "diamondRank": "Diamond",
      "holdDays": 245,
      "multiplier": 3.5,
      "score": 28
    }
  ]
}
```

---

### Bundle Detection

#### `GET /api/detect/:txSignature`
Check if a transaction shows bundling behavior.

**Query Parameters:**
- `launchId` (required): The launch to check against

**Response:**
```json
{
  "success": true,
  "analysis": {
    "transactionSignature": "5xYz...",
    "launchId": "launch_123...",
    "isBundled": true,
    "confidence": 85,
    "flags": [
      {
        "type": "same_block_buys",
        "severity": "high",
        "description": "4 buys in the same block"
      },
      {
        "type": "same_funding_source",
        "severity": "high",
        "description": "Funded from same source as 3 other buyers"
      }
    ],
    "relatedWallets": ["wallet1...", "wallet2..."],
    "action": "reduce_rewards",
    "penaltyApplied": {
      "action": "reduce_rewards",
      "rewardReductionPercent": 50,
      "reason": "Suspected bundling - rewards reduced by 50%"
    }
  }
}
```

#### `GET /api/bundlers`
List known bundler wallets.

**Response:**
```json
{
  "success": true,
  "count": 89,
  "bundlers": ["wallet1...", "wallet2...", ...]
}
```

---

### Rewards

#### `GET /api/rewards/:wallet`
Calculate rewards for a holder.

**Query Parameters:**
- `launchId` (required): The launch to calculate rewards for

**Response:**
```json
{
  "success": true,
  "rewards": {
    "wallet": "HolderWallet123...",
    "launchId": "launch_123...",
    "baseRewards": 10000,
    "diamondBonus": 15000,
    "loyaltyBonus": 2500,
    "totalRewards": 27500,
    "holdMultiplier": 2.5,
    "loyaltyMultiplier": 1.1,
    "claimable": true
  },
  "projection": [
    { "day": 7, "rank": "Bronze", "multiplier": 1.5, "estimatedRewards": 15000 },
    { "day": 30, "rank": "Silver", "multiplier": 2.0, "estimatedRewards": 60000 },
    { "day": 90, "rank": "Platinum", "multiplier": 3.0, "estimatedRewards": 270000 }
  ]
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": { ... }  // Optional additional info
}
```

**HTTP Status Codes:**
- `400` - Bad request (validation failed)
- `404` - Resource not found
- `500` - Server error

---

## Bundle Detection Flags

| Flag Type | Description | Severity |
|-----------|-------------|----------|
| `same_funding_source` | Wallets funded from same address | High |
| `same_block_buys` | Multiple buys in same block | High |
| `similar_amounts` | Suspiciously identical buy amounts | Medium |
| `new_wallet_cluster` | Cluster of brand new wallets | Medium |
| `timing_pattern` | Buys at regular intervals | Medium |
| `known_bundler` | Wallet flagged from previous incidents | Critical |
| `wash_trading` | Circular trading pattern | High |

## Bundle Actions

| Confidence | Action | Effect |
|------------|--------|--------|
| 0-30% | `none` | No action |
| 30-50% | `flag` | Flagged for review |
| 50-70% | `delay_rewards` | Rewards delayed 30 days |
| 70-90% | `reduce_rewards` | Rewards reduced 50% |
| 90%+ | `block` | Blocked from participation |

---

## Rate Limits

- Public endpoints: 100 requests/minute
- Authenticated endpoints: 1000 requests/minute

---

## SDKs

Coming soon:
- TypeScript/JavaScript
- Python
- Rust

---

*Built with 💎 by Kiki for the Colosseum Agent Hackathon*
