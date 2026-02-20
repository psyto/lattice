use anchor_lang::prelude::*;

/// Dimension indices matching SOVEREIGN
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum TrustDimension {
    Trading = 0,
    Civic = 1,
    Developer = 2,
    Infra = 3,
    Creator = 4,
}

/// Trust edge data -- stored OFF-CHAIN in Merkle tree
/// Only the Merkle root is on-chain (32 bytes for unlimited edges)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TrustEdgeData {
    /// Who you trust
    pub trustee: Pubkey,
    /// Which dimension you trust them for
    pub dimension: TrustDimension,
    /// How much you trust them (0-10000 basis points)
    pub weight: u16,
    /// When this edge was created
    pub created_at: i64,
}

impl TrustEdgeData {
    pub const SERIALIZED_SIZE: usize = 32 + 1 + 2 + 8; // 43 bytes per edge
}
