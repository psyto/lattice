import { Connection, PublicKey } from '@solana/web3.js';
import {
  TrustDimension,
  TrustSource,
  TrustNode,
  TrustQueryResult,
  TrustAssessment,
  TrustConfidence,
  TrustConfig,
  TrustEdge,
  DEFAULT_TRUST_CONFIG,
} from './types';
import {
  readSovereignScores,
  batchReadSovereignScores,
  getDimensionScore,
} from './sovereign-reader';
import { TrustEdgeStore } from './merkle';
import { getTrustAnchorPda, LATTICE_PROGRAM_ID } from './pda';

// =============================================================================
// LATTICE Trust Propagation Engine
// =============================================================================
//
// Andrew Trust's "friends of friends of friends x6" — the veracity layer.
//
// BFS traversal through 5 trust edge sources:
//   1. Explicit LATTICE edges (from TrustAnchor Merkle trees)
//   2. DAO co-membership (from SOVEREIGN CreatorDAO)
//   3. Nomination patterns (from SOVEREIGN nominations)
//   4. Co-staking alignment (from Komon prediction markets)
//   5. DataSov2 access grants
//
// Each hop decays trust by a configurable factor (default 0.6).
// Results are ranked by: trustWeight × (dimensionScore / 10000)
// =============================================================================

/**
 * Edge provider interface — pluggable sources of trust edges
 */
export interface EdgeProvider {
  /** Human-readable name */
  name: string;
  /** Trust source type */
  source: TrustSource;
  /**
   * Discover trust edges for a given wallet.
   * Returns: array of { wallet, weight (0-1) } pairs
   */
  getEdges(
    connection: Connection,
    wallet: PublicKey,
    dimension: TrustDimension,
  ): Promise<Array<{ wallet: PublicKey; weight: number }>>;
}

// =============================================================================
// Built-in Edge Providers
// =============================================================================

/**
 * Provider 1: Explicit LATTICE trust edges
 * Reads TrustAnchor accounts and their off-chain edge stores
 */
export class ExplicitEdgeProvider implements EdgeProvider {
  name = 'LATTICE Explicit';
  source = TrustSource.Explicit;

  private edgeStores: Map<string, TrustEdgeStore> = new Map();

  /**
   * Register a locally-known edge store for a wallet
   * (In production, these would be fetched from Arweave/IPFS)
   */
  registerStore(owner: PublicKey, store: TrustEdgeStore): void {
    this.edgeStores.set(owner.toBase58(), store);
  }

  async getEdges(
    connection: Connection,
    wallet: PublicKey,
    dimension: TrustDimension,
  ): Promise<Array<{ wallet: PublicKey; weight: number }>> {
    // Check if we have a locally registered store
    const store = this.edgeStores.get(wallet.toBase58());
    if (!store) return [];

    return store
      .getEdgesByDimension(dimension)
      .map((edge) => ({
        wallet: edge.trustee,
        weight: edge.weight / 10000,
      }));
  }
}

/**
 * Provider 2: DAO co-membership edges
 * Users in the same CreatorDAO share a trust edge.
 * Smaller, more elite DAOs produce stronger trust signals.
 */
export class DaoCoMembershipProvider implements EdgeProvider {
  name = 'DAO Co-Membership';
  source = TrustSource.DaoCoMembership;

  private membershipCache: Map<string, PublicKey[]> = new Map();

  /**
   * Register known DAO memberships
   * In production, these would be discovered via getProgramAccounts
   */
  registerDaoMembers(daoId: string, members: PublicKey[]): void {
    this.membershipCache.set(daoId, members);
  }

  async getEdges(
    _connection: Connection,
    wallet: PublicKey,
    _dimension: TrustDimension,
  ): Promise<Array<{ wallet: PublicKey; weight: number }>> {
    const edges: Array<{ wallet: PublicKey; weight: number }> = [];
    const walletStr = wallet.toBase58();

    for (const [daoId, members] of this.membershipCache.entries()) {
      const isMember = members.some((m) => m.toBase58() === walletStr);
      if (!isMember) continue;

      const prestige = daoPrestigeWeight(members.length);

      for (const member of members) {
        if (member.toBase58() === walletStr) continue;
        edges.push({ wallet: member, weight: prestige });
      }
    }

    return edges;
  }
}

/**
 * Provider 3: Nomination patterns
 * Successful nominations create a trust edge from nominator to nominee.
 */
export class NominationProvider implements EdgeProvider {
  name = 'Nomination';
  source = TrustSource.Nomination;

  private nominations: Map<string, Array<{ nominee: PublicKey; accuracy: number }>> = new Map();

  /**
   * Register known nomination results
   */
  registerNominations(
    nominator: PublicKey,
    nominees: Array<{ nominee: PublicKey; accuracy: number }>,
  ): void {
    this.nominations.set(nominator.toBase58(), nominees);
  }

  async getEdges(
    _connection: Connection,
    wallet: PublicKey,
    _dimension: TrustDimension,
  ): Promise<Array<{ wallet: PublicKey; weight: number }>> {
    const noms = this.nominations.get(wallet.toBase58());
    if (!noms) return [];

    return noms.map((n) => ({
      wallet: n.nominee,
      // Nomination weight: base 0.7 × nominator accuracy (0-1)
      weight: 0.7 * (n.accuracy / 10000),
    }));
  }
}

/**
 * Provider 4: Prediction co-staking
 * Users who consistently predict the same outcomes (correctly) share epistemic trust.
 */
export class CoStakingProvider implements EdgeProvider {
  name = 'Co-Staking';
  source = TrustSource.CoStaking;

  private coStakers: Map<string, Array<{ wallet: PublicKey; coAccuracy: number; sharedMarkets: number }>> = new Map();

  /**
   * Register discovered co-staking relationships
   */
  registerCoStakers(
    wallet: PublicKey,
    partners: Array<{ wallet: PublicKey; coAccuracy: number; sharedMarkets: number }>,
  ): void {
    this.coStakers.set(wallet.toBase58(), partners);
  }

  async getEdges(
    _connection: Connection,
    wallet: PublicKey,
    _dimension: TrustDimension,
  ): Promise<Array<{ wallet: PublicKey; weight: number }>> {
    const partners = this.coStakers.get(wallet.toBase58());
    if (!partners) return [];

    return partners
      .filter((p) => p.coAccuracy >= 6000 && p.sharedMarkets >= 3)
      .map((p) => ({
        wallet: p.wallet,
        weight: (p.coAccuracy / 10000) * 0.5,
      }));
  }
}

/**
 * Provider 5: DataSov2 access grants
 * Granting someone access to your data is an explicit trust signal.
 */
export class AccessGrantProvider implements EdgeProvider {
  name = 'Access Grant';
  source = TrustSource.AccessGrant;

  private grants: Map<string, Array<{ consumer: PublicKey; permissionWeight: number }>> = new Map();

  /**
   * Register known access grants
   */
  registerGrants(
    owner: PublicKey,
    grants: Array<{ consumer: PublicKey; permissionWeight: number }>,
  ): void {
    this.grants.set(owner.toBase58(), grants);
  }

  async getEdges(
    _connection: Connection,
    wallet: PublicKey,
    _dimension: TrustDimension,
  ): Promise<Array<{ wallet: PublicKey; weight: number }>> {
    const g = this.grants.get(wallet.toBase58());
    if (!g) return [];
    return g.map((grant) => ({
      wallet: grant.consumer,
      weight: grant.permissionWeight,
    }));
  }
}

// =============================================================================
// DAO Prestige Weight
// =============================================================================

/**
 * Smaller, more selective DAOs produce stronger trust signals.
 * Matches Vitalik's recommendation: split DAOs > 200 members.
 */
function daoPrestigeWeight(memberCount: number): number {
  if (memberCount <= 10) return 0.9;
  if (memberCount <= 30) return 0.7;
  if (memberCount <= 80) return 0.5;
  if (memberCount <= 150) return 0.35;
  return 0.2;
}

// =============================================================================
// Trust Propagation Engine
// =============================================================================

export class TrustPropagationEngine {
  private connection: Connection;
  private providers: EdgeProvider[];
  private config: TrustConfig;

  constructor(
    connection: Connection,
    providers: EdgeProvider[],
    config: Partial<TrustConfig> = {},
  ) {
    this.connection = connection;
    this.providers = providers;
    this.config = { ...DEFAULT_TRUST_CONFIG, ...config };
  }

  /**
   * Query the trust graph — Andrew's "friends of friends x6"
   *
   * BFS traversal from origin, discovering trust edges at each hop,
   * decaying trust weight, and enriching with SOVEREIGN scores.
   */
  async query(
    origin: PublicKey,
    dimension: TrustDimension,
    configOverrides: Partial<TrustConfig> = {},
  ): Promise<TrustQueryResult> {
    const startTime = Date.now();
    const config = { ...this.config, ...configOverrides };

    const visited = new Set<string>();
    const results: TrustNode[] = [];

    // BFS queue: { wallet, trustWeight, depth, path, source }
    interface QueueEntry {
      wallet: PublicKey;
      trustWeight: number;
      depth: number;
      path: PublicKey[];
      source: TrustSource;
    }

    const queue: QueueEntry[] = [];

    // ── SEED: Discover direct edges from origin ──
    visited.add(origin.toBase58());

    for (const provider of this.providers) {
      const edges = await provider.getEdges(this.connection, origin, dimension);
      for (const edge of edges) {
        if (visited.has(edge.wallet.toBase58())) continue;
        queue.push({
          wallet: edge.wallet,
          trustWeight: edge.weight,
          depth: 1,
          path: [origin, edge.wallet],
          source: provider.source,
        });
      }
    }

    // ── BFS PROPAGATION ──
    let maxDepthReached = 0;

    while (queue.length > 0) {
      const entry = queue.shift()!;
      const walletStr = entry.wallet.toBase58();

      // Skip if already visited, too deep, or too low trust
      if (visited.has(walletStr)) continue;
      if (entry.depth > config.maxDepth) continue;
      if (entry.trustWeight < config.minTrust) continue;

      visited.add(walletStr);
      maxDepthReached = Math.max(maxDepthReached, entry.depth);

      // Read SOVEREIGN score for dimension (will be batched later for perf)
      const scores = await readSovereignScores(this.connection, entry.wallet);
      const dimScore = scores ? getDimensionScore(scores, dimension) : 0;
      const compositeScore = scores?.composite ?? 0;
      const tier = scores?.tier ?? 1;

      // Only include if meets minimum score
      if (dimScore >= config.minScore) {
        const combined = entry.trustWeight * (dimScore / 10000);
        results.push({
          wallet: entry.wallet,
          dimension,
          dimensionScore: dimScore,
          compositeScore,
          tier,
          trustWeight: entry.trustWeight,
          depth: entry.depth,
          path: entry.path,
          source: entry.source,
          combinedScore: combined,
        });
      }

      // ── PROPAGATE: Discover THEIR edges ──
      if (entry.depth < config.maxDepth) {
        // At depth > 1, only use strongest signal providers to prevent explosion
        const activeProviders = entry.depth === 1
          ? this.providers
          : this.providers.filter((p) =>
              p.source === TrustSource.Explicit ||
              p.source === TrustSource.DaoCoMembership ||
              p.source === TrustSource.Nomination
            );

        for (const provider of activeProviders) {
          const edges = await provider.getEdges(this.connection, entry.wallet, dimension);
          for (const edge of edges) {
            if (visited.has(edge.wallet.toBase58())) continue;
            queue.push({
              wallet: edge.wallet,
              trustWeight: entry.trustWeight * config.trustDecay * edge.weight,
              depth: entry.depth + 1,
              path: [...entry.path, edge.wallet],
              source: provider.source,
            });
          }
        }
      }
    }

    // ── RANK by combined score ──
    results.sort((a, b) => b.combinedScore - a.combinedScore);

    return {
      origin,
      dimension,
      nodes: results.slice(0, config.limit),
      totalDiscovered: results.length,
      maxDepthReached,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Assess trust for a specific target
   * Finds the shortest/strongest trust path from origin to target
   */
  async assess(
    origin: PublicKey,
    target: PublicKey,
    dimension: TrustDimension,
    configOverrides: Partial<TrustConfig> = {},
  ): Promise<TrustAssessment> {
    const config = { ...this.config, ...configOverrides, maxDepth: 6 };

    // Run full query then find target in results
    const result = await this.query(origin, dimension, { ...config, limit: 10000, minScore: 0 });
    const targetStr = target.toBase58();
    const node = result.nodes.find((n) => n.wallet.toBase58() === targetStr);

    if (!node) {
      // No path found — still return target's raw score
      const scores = await readSovereignScores(this.connection, target);
      return {
        target,
        dimension,
        dimensionScore: scores ? getDimensionScore(scores, dimension) : 0,
        tier: scores?.tier ?? 1,
        trustWeight: 0,
        path: [],
        depth: 0,
        confidence: TrustConfidence.None,
      };
    }

    return {
      target,
      dimension,
      dimensionScore: node.dimensionScore,
      tier: node.tier,
      trustWeight: node.trustWeight,
      path: node.path,
      depth: node.depth,
      confidence: assessConfidence(node.trustWeight, node.depth),
    };
  }
}

/**
 * Determine confidence level from trust weight and depth
 */
function assessConfidence(trustWeight: number, depth: number): TrustConfidence {
  if (trustWeight === 0) return TrustConfidence.None;
  if (depth <= 1 && trustWeight >= 0.5) return TrustConfidence.High;
  if (depth <= 3 && trustWeight >= 0.1) return TrustConfidence.Medium;
  return TrustConfidence.Low;
}

// =============================================================================
// Factory — Quick Setup
// =============================================================================

/**
 * Create a fully-configured TrustPropagationEngine with all built-in providers
 */
export function createTrustEngine(
  connection: Connection,
  config: Partial<TrustConfig> = {},
): {
  engine: TrustPropagationEngine;
  explicit: ExplicitEdgeProvider;
  dao: DaoCoMembershipProvider;
  nomination: NominationProvider;
  coStaking: CoStakingProvider;
  accessGrant: AccessGrantProvider;
} {
  const explicit = new ExplicitEdgeProvider();
  const dao = new DaoCoMembershipProvider();
  const nomination = new NominationProvider();
  const coStaking = new CoStakingProvider();
  const accessGrant = new AccessGrantProvider();

  const engine = new TrustPropagationEngine(
    connection,
    [explicit, dao, nomination, coStaking, accessGrant],
    config,
  );

  return { engine, explicit, dao, nomination, coStaking, accessGrant };
}
