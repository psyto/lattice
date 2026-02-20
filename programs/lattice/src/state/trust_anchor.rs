use anchor_lang::prelude::*;

/// Trust anchor: stores a user's trust graph as a Merkle root
/// One per user. Minimal on-chain footprint (Stratum pattern).
#[account]
pub struct TrustAnchor {
    /// The wallet that owns this trust anchor
    pub owner: Pubkey,
    /// Merkle root of all trust edges
    pub merkle_root: [u8; 32],
    /// Number of trust edges in the tree
    pub edge_count: u16,
    /// When this anchor was last updated
    pub last_updated: i64,
    /// When this anchor was created
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl TrustAnchor {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                     // owner
        32 +                     // merkle_root
        2 +                      // edge_count
        8 +                      // last_updated
        8 +                      // created_at
        1;                       // bump
    // Total: 91 bytes
}
