# LATTICE

Decentralized trust graph protocol for Solana — the veracity layer for SPECTER v2.

LATTICE answers: **"Who should I trust, for what, and why?"**

## Overview

LATTICE implements a distributed trust system using Merkle-proofed edges stored off-chain with roots committed on-chain. Trust propagates through BFS traversal across multiple dimensions, combining explicit trust declarations with implicit signals from DAO memberships, nominations, co-staking, and access grants.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    ON-CHAIN (Solana)                  │
│                                                      │
│  TrustAnchor PDA          Verify Edge (CPI)          │
│  ┌──────────────┐         ┌──────────────────┐       │
│  │ owner        │         │ Merkle proof      │       │
│  │ merkle_root  │◄────────│ verification via  │       │
│  │ edge_count   │         │ Keccak256 hashing │       │
│  │ timestamps   │         └──────────────────┘       │
│  └──────────────┘                                    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                   OFF-CHAIN (SDK)                     │
│                                                      │
│  Trust Propagation Engine (BFS)                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ 5 Edge Providers:                           │     │
│  │  • ExplicitEdgeProvider (LATTICE edges)     │     │
│  │  • DaoCoMembershipProvider (CreatorDAO)     │     │
│  │  • NominationProvider (DAO nominations)     │     │
│  │  • CoStakingProvider (Komon co-staking)     │     │
│  │  • AccessGrantProvider (DataSov2 grants)    │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

## Trust Dimensions

| Dimension | Description |
|-----------|-------------|
| **Trading** | Market behavior and trading reputation |
| **Civic** | Community participation and governance |
| **Developer** | Technical contributions and code quality |
| **Infra** | Infrastructure operation and reliability |
| **Creator** | Content creation and creative contributions |

## Project Structure

```
├── programs/lattice/          # Solana smart contract (Anchor)
│   └── src/
│       ├── lib.rs             # 3 instructions: initialize, update_root, verify_edge
│       ├── errors.rs          # Custom error codes
│       ├── instructions/      # Instruction handlers
│       └── state/             # Account structures + Merkle utilities
│
├── sdk/                       # TypeScript SDK
│   └── src/
│       ├── index.ts           # Exports + createTrustEngine factory
│       ├── types.ts           # Protocol types (TrustEdge, TrustDimension, etc.)
│       ├── pda.ts             # Program address derivation
│       ├── merkle.ts          # Merkle tree + TrustEdgeStore
│       ├── client.ts          # On-chain client
│       ├── sovereign-reader.ts # SOVEREIGN identity score reader
│       └── propagation.ts     # Trust propagation engine (BFS)
│
├── Anchor.toml                # Anchor configuration
└── Cargo.toml                 # Workspace root
```

## On-Chain Instructions

| Instruction | Description |
|------------|-------------|
| `initialize` | Creates a TrustAnchor PDA for a user (91 bytes) |
| `update_root` | Batch updates Merkle root after off-chain edge changes |
| `verify_edge` | On-chain Merkle proof verification via CPI |

## SDK Usage

```typescript
import { createTrustEngine, TrustDimension } from '@lattice/sdk';
import { Connection } from '@solana/web3.js';

const connection = new Connection('http://localhost:8899');
const { engine, explicit, dao } = createTrustEngine(connection);

// Register trust edges
explicit.registerStore(walletA, edgeStore);
dao.registerDaoMembers('dao-1', [walletB, walletC]);

// Query trust graph (BFS traversal)
const result = await engine.query(
  origin,
  TrustDimension.Trading,
  { maxDepth: 3, trustDecay: 0.6 }
);

// Assess trust for a specific target
const assessment = await engine.assess(
  origin,
  target,
  TrustDimension.Developer
);
// => { confidence: 'High', weight: 0.85, path: [...], score: 7200 }
```

## Trust Propagation

- **Trust decay**: Configurable per-hop decay (default 0.6)
- **Max depth**: 1-6 hops (inspired by "friends of friends x6")
- **Scoring**: `trustWeight x (dimensionScore / 10000)`
- **DAO prestige weighting**: Smaller DAOs = stronger signal
  - ≤10 members: 0.9 weight
  - ≤30 members: 0.7 weight
  - ≤80 members: 0.5 weight
  - ≤150 members: 0.35 weight
  - &gt;150 members: 0.2 weight

## Prerequisites

- Node.js 18+ (SDK)
- Rust 1.70+ (smart contract)
- Solana CLI + Anchor CLI

## Build

```bash
# Smart contract
anchor build

# TypeScript SDK
cd sdk && npm install && npm run build
```

## Deploy (Localnet)

```bash
solana-test-validator
anchor deploy
```

## Dependencies

**On-chain**: Anchor 0.30, Solana Program 1.18

**SDK**: @coral-xyz/anchor, @solana/web3.js, bn.js

## License

MIT
