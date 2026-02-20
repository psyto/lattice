// =============================================================================
// @lattice/sdk — Trust Graph Propagation for the SPECTER Protocol
// =============================================================================
//
// "Friends of friends of friends x6" — Andrew Trust
// "They can't hit what they can't see." — Balaji Srinivasan
//
// LATTICE is the veracity layer of SPECTER v2.
// It answers: "Who should I trust, for what, and why?"
//
// Three pillars (Andrew's framework):
//   1. AI solves overload (ORÁCULO agent)
//   2. Crypto solves privacy (SPECTER v1 + Veil)
//   3. Distributed trust solves veracity (LATTICE ← you are here)
// =============================================================================

// Types
export {
  TrustDimension,
  DIMENSION_LABELS,
  parseDimension,
  TrustAnchor,
  TrustEdge,
  SovereignScores,
  TrustSource,
  TrustNode,
  TrustQueryResult,
  TrustAssessment,
  TrustConfidence,
  TrustConfig,
  DEFAULT_TRUST_CONFIG,
} from './types';

// PDA derivation
export {
  LATTICE_PROGRAM_ID,
  SOVEREIGN_PROGRAM_ID,
  getTrustAnchorPda,
  getIdentityPda,
  getDaoPda,
  getDaoMembershipPda,
  getCreatorDetailsPda,
  getNominationPda,
} from './pda';

// Merkle tree & edge management
export {
  hashLeaf,
  hashNodes,
  hashTrustEdge,
  serializeTrustEdge,
  deserializeTrustEdge,
  MerkleTree,
  TrustEdgeStore,
} from './merkle';

// SOVEREIGN reader (lightweight, no Anchor dependency for reads)
export {
  readSovereignScores,
  readDimensionScore,
  batchReadSovereignScores,
  getDimensionScore,
  getTierName,
} from './sovereign-reader';

// Trust propagation engine
export {
  EdgeProvider,
  ExplicitEdgeProvider,
  DaoCoMembershipProvider,
  NominationProvider,
  CoStakingProvider,
  AccessGrantProvider,
  TrustPropagationEngine,
  createTrustEngine,
} from './propagation';

// LATTICE on-chain client
export { LatticeClient } from './client';
