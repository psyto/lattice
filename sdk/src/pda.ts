import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// =============================================================================
// Program IDs
// =============================================================================

export const LATTICE_PROGRAM_ID = new PublicKey(
  'LATTiCEtRuStGrApH11111111111111111111111111'
);

export const SOVEREIGN_PROGRAM_ID = new PublicKey(
  '2UAZc1jj4QTSkgrC8U9d4a7EM9AQunxMvW5g7rX7Af9T'
);

// =============================================================================
// LATTICE PDAs
// =============================================================================

/**
 * Derive the PDA for a user's TrustAnchor
 */
export function getTrustAnchorPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('trust'), owner.toBuffer()],
    LATTICE_PROGRAM_ID
  );
}

// =============================================================================
// SOVEREIGN PDAs (re-exported for convenience)
// =============================================================================

/**
 * Derive the PDA for a user's SOVEREIGN identity
 */
export function getIdentityPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('identity'), owner.toBuffer()],
    SOVEREIGN_PROGRAM_ID
  );
}

/**
 * Derive the PDA for a Creator DAO
 */
export function getDaoPda(founder: PublicKey, daoId: BN | number): [PublicKey, number] {
  const id = typeof daoId === 'number' ? new BN(daoId) : daoId;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator_dao'), founder.toBuffer(), id.toArrayLike(Buffer, 'le', 8)],
    SOVEREIGN_PROGRAM_ID
  );
}

/**
 * Derive the PDA for a DAO membership
 */
export function getDaoMembershipPda(dao: PublicKey, memberWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dao_membership'), dao.toBuffer(), memberWallet.toBuffer()],
    SOVEREIGN_PROGRAM_ID
  );
}

/**
 * Derive the PDA for creator score details
 */
export function getCreatorDetailsPda(identity: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator_details'), identity.toBuffer()],
    SOVEREIGN_PROGRAM_ID
  );
}

/**
 * Derive the PDA for a nomination
 */
export function getNominationPda(dao: PublicKey, nonce: BN | number): [PublicKey, number] {
  const n = typeof nonce === 'number' ? new BN(nonce) : nonce;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('nomination'), dao.toBuffer(), n.toArrayLike(Buffer, 'le', 8)],
    SOVEREIGN_PROGRAM_ID
  );
}
