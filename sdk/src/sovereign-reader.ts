import { Connection, PublicKey } from '@solana/web3.js';
import { SovereignScores, TrustDimension, DIMENSION_LABELS } from './types';
import { getIdentityPda, SOVEREIGN_PROGRAM_ID } from './pda';

// =============================================================================
// SOVEREIGN Identity Reader
// =============================================================================
// Reads SOVEREIGN identity accounts directly from Solana without Anchor.
// Parses the raw binary layout to avoid heavy dependencies.
// =============================================================================

/**
 * SovereignIdentity binary layout (236 bytes total):
 *   8  discriminator
 *  32  owner
 *   8  created_at (i64 LE)
 *  32  trading_authority
 *  32  civic_authority
 *  32  developer_authority
 *  32  infra_authority
 *  32  creator_authority
 *   2  trading_score (u16 LE)
 *   2  civic_score (u16 LE)
 *   2  developer_score (u16 LE)
 *   2  infra_score (u16 LE)
 *   2  creator_score (u16 LE)
 *   2  composite_score (u16 LE)
 *   1  tier (u8)
 *   8  last_updated (i64 LE)
 *   1  bump (u8)
 */
const IDENTITY_SIZE = 236;
const SCORES_OFFSET = 8 + 32 + 8 + (32 * 5); // = 208
// trading_score at 208, civic at 210, developer at 212, infra at 214, creator at 216
// composite at 218, tier at 220

/**
 * Read a SOVEREIGN identity's scores from Solana
 */
export async function readSovereignScores(
  connection: Connection,
  owner: PublicKey,
): Promise<SovereignScores | null> {
  const [pda] = getIdentityPda(owner);

  const accountInfo = await connection.getAccountInfo(pda);
  if (!accountInfo || accountInfo.data.length < IDENTITY_SIZE) {
    return null;
  }

  const data = accountInfo.data;
  return {
    trading: data.readUInt16LE(SCORES_OFFSET),
    civic: data.readUInt16LE(SCORES_OFFSET + 2),
    developer: data.readUInt16LE(SCORES_OFFSET + 4),
    infra: data.readUInt16LE(SCORES_OFFSET + 6),
    creator: data.readUInt16LE(SCORES_OFFSET + 8),
    composite: data.readUInt16LE(SCORES_OFFSET + 10),
    tier: data.readUInt8(SCORES_OFFSET + 12),
  };
}

/**
 * Read a specific dimension score
 */
export async function readDimensionScore(
  connection: Connection,
  owner: PublicKey,
  dimension: TrustDimension,
): Promise<number> {
  const scores = await readSovereignScores(connection, owner);
  if (!scores) return 0;
  return getDimensionScore(scores, dimension);
}

/**
 * Extract a specific dimension score from a Scores object
 */
export function getDimensionScore(scores: SovereignScores, dimension: TrustDimension): number {
  switch (dimension) {
    case TrustDimension.Trading: return scores.trading;
    case TrustDimension.Civic: return scores.civic;
    case TrustDimension.Developer: return scores.developer;
    case TrustDimension.Infra: return scores.infra;
    case TrustDimension.Creator: return scores.creator;
  }
}

/**
 * Batch-read SOVEREIGN scores for multiple wallets
 * Uses getMultipleAccountsInfo for efficiency
 */
export async function batchReadSovereignScores(
  connection: Connection,
  owners: PublicKey[],
): Promise<Map<string, SovereignScores>> {
  const results = new Map<string, SovereignScores>();
  if (owners.length === 0) return results;

  // Derive all PDAs
  const pdas = owners.map((owner) => getIdentityPda(owner)[0]);

  // Batch fetch (Solana limits to 100 per call)
  const BATCH_SIZE = 100;
  for (let i = 0; i < pdas.length; i += BATCH_SIZE) {
    const batch = pdas.slice(i, i + BATCH_SIZE);
    const batchOwners = owners.slice(i, i + BATCH_SIZE);
    const accounts = await connection.getMultipleAccountsInfo(batch);

    for (let j = 0; j < accounts.length; j++) {
      const accountInfo = accounts[j];
      if (!accountInfo || accountInfo.data.length < IDENTITY_SIZE) continue;

      const data = accountInfo.data;
      results.set(batchOwners[j].toBase58(), {
        trading: data.readUInt16LE(SCORES_OFFSET),
        civic: data.readUInt16LE(SCORES_OFFSET + 2),
        developer: data.readUInt16LE(SCORES_OFFSET + 4),
        infra: data.readUInt16LE(SCORES_OFFSET + 6),
        creator: data.readUInt16LE(SCORES_OFFSET + 8),
        composite: data.readUInt16LE(SCORES_OFFSET + 10),
        tier: data.readUInt8(SCORES_OFFSET + 12),
      });
    }
  }

  return results;
}

/**
 * Tier name lookup
 */
export function getTierName(tier: number): string {
  switch (tier) {
    case 1: return 'Bronze';
    case 2: return 'Silver';
    case 3: return 'Gold';
    case 4: return 'Platinum';
    case 5: return 'Diamond';
    default: return 'Unknown';
  }
}
