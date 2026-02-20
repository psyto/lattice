import { PublicKey } from '@solana/web3.js';

// =============================================================================
// LATTICE Protocol Types
// =============================================================================

/**
 * SOVEREIGN dimension indices (matching on-chain enum)
 */
export enum TrustDimension {
  Trading = 0,
  Civic = 1,
  Developer = 2,
  Infra = 3,
  Creator = 4,
}

/**
 * Dimension string labels
 */
export const DIMENSION_LABELS: Record<TrustDimension, string> = {
  [TrustDimension.Trading]: 'trading',
  [TrustDimension.Civic]: 'civic',
  [TrustDimension.Developer]: 'developer',
  [TrustDimension.Infra]: 'infra',
  [TrustDimension.Creator]: 'creator',
};

/**
 * Parse dimension string to enum
 */
export function parseDimension(s: string): TrustDimension {
  switch (s.toLowerCase()) {
    case 'trading': return TrustDimension.Trading;
    case 'civic': return TrustDimension.Civic;
    case 'developer': return TrustDimension.Developer;
    case 'infra': return TrustDimension.Infra;
    case 'creator': return TrustDimension.Creator;
    default: throw new Error(`Unknown dimension: ${s}`);
  }
}

// =============================================================================
// On-Chain Account Types
// =============================================================================

/**
 * TrustAnchor account (on-chain, one per user)
 */
export interface TrustAnchor {
  owner: PublicKey;
  merkleRoot: Uint8Array; // 32 bytes
  edgeCount: number;
  lastUpdated: number;    // unix timestamp
  createdAt: number;
  bump: number;
}

/**
 * Trust edge (stored off-chain in Merkle tree)
 */
export interface TrustEdge {
  trustee: PublicKey;
  dimension: TrustDimension;
  weight: number;         // 0-10000 basis points
  createdAt: number;      // unix timestamp
}

/**
 * SOVEREIGN identity scores (read from SOVEREIGN program)
 */
export interface SovereignScores {
  trading: number;
  civic: number;
  developer: number;
  infra: number;
  creator: number;
  composite: number;
  tier: number;
}

// =============================================================================
// Trust Graph Types
// =============================================================================

/**
 * Source of a trust edge (how we discovered this connection)
 */
export enum TrustSource {
  /** Explicit LATTICE trust declaration */
  Explicit = 'explicit',
  /** Co-members in a SOVEREIGN CreatorDAO */
  DaoCoMembership = 'dao_co_membership',
  /** Successful nomination in a CreatorDAO */
  Nomination = 'nomination',
  /** Co-staked on same Komon prediction markets with aligned accuracy */
  CoStaking = 'co_staking',
  /** Granted DataSov2 access permission */
  AccessGrant = 'access_grant',
}

/**
 * A node in the trust graph traversal result
 */
export interface TrustNode {
  /** Wallet address */
  wallet: PublicKey;
  /** Requested dimension */
  dimension: TrustDimension;
  /** Score in the requested dimension (from SOVEREIGN) */
  dimensionScore: number;
  /** Composite SOVEREIGN score */
  compositeScore: number;
  /** SOVEREIGN tier (1-5) */
  tier: number;
  /** Decayed trust weight from origin (0-1) */
  trustWeight: number;
  /** Number of hops from origin */
  depth: number;
  /** Full trust path (wallet addresses) */
  path: PublicKey[];
  /** How this node was discovered */
  source: TrustSource;
  /** Combined score: trustWeight × (dimensionScore / 10000) */
  combinedScore: number;
}

/**
 * Result of a trust graph query
 */
export interface TrustQueryResult {
  /** Origin wallet */
  origin: PublicKey;
  /** Queried dimension */
  dimension: TrustDimension;
  /** Trusted nodes, ranked by combined score */
  nodes: TrustNode[];
  /** Total nodes discovered (before limit) */
  totalDiscovered: number;
  /** Maximum depth reached */
  maxDepthReached: number;
  /** Query duration in ms */
  durationMs: number;
}

/**
 * Trust score assessment for a specific target
 */
export interface TrustAssessment {
  /** Target wallet */
  target: PublicKey;
  /** Dimension queried */
  dimension: TrustDimension;
  /** Target's dimension score */
  dimensionScore: number;
  /** Target's SOVEREIGN tier */
  tier: number;
  /** Trust weight (0-1, 0 = no trust path found) */
  trustWeight: number;
  /** Trust path from origin to target */
  path: PublicKey[];
  /** Depth (hops) */
  depth: number;
  /** Confidence level */
  confidence: TrustConfidence;
}

export enum TrustConfidence {
  /** Direct trust edge or DAO co-member (depth 1) */
  High = 'high',
  /** 2-3 hops away with reasonable weight */
  Medium = 'medium',
  /** 4-6 hops or low weight */
  Low = 'low',
  /** No trust path found */
  None = 'none',
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Trust propagation configuration
 */
export interface TrustConfig {
  /** Trust decay per hop (0-1). Default: 0.6 */
  trustDecay: number;
  /** Maximum traversal depth (1-6). Default: 3 */
  maxDepth: number;
  /** Minimum trust weight to continue traversal. Default: 0.01 */
  minTrust: number;
  /** Maximum results to return. Default: 50 */
  limit: number;
  /** Minimum SOVEREIGN dimension score to include. Default: 0 */
  minScore: number;
  /** RPC batch size for account fetches. Default: 100 */
  batchSize: number;
}

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  trustDecay: 0.6,
  maxDepth: 3,
  minTrust: 0.01,
  limit: 50,
  minScore: 0,
  batchSize: 100,
};
