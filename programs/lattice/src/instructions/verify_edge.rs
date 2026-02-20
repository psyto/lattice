use anchor_lang::prelude::*;

use crate::errors::LatticeError;
use crate::state::merkle::{hash_leaf, verify_proof};
use crate::state::{TrustAnchor, TrustEdgeData};

#[derive(Accounts)]
pub struct VerifyEdge<'info> {
    #[account(
        seeds = [b"trust", trust_anchor.owner.as_ref()],
        bump = trust_anchor.bump,
    )]
    pub trust_anchor: Account<'info, TrustAnchor>,
}

pub fn handler(
    ctx: Context<VerifyEdge>,
    edge_data: TrustEdgeData,
    proof: Vec<[u8; 32]>,
    leaf_index: u32,
) -> Result<()> {
    let trust_anchor = &ctx.accounts.trust_anchor;

    // Validate the trust weight is in range (0-10000 basis points)
    require!(
        edge_data.weight <= 10_000,
        LatticeError::InvalidTrustWeight
    );

    // Serialize the edge data to produce the leaf
    let serialized = edge_data.try_to_vec()?;
    let leaf = hash_leaf(&serialized);

    // Verify the Merkle proof against the on-chain root
    require!(
        verify_proof(&proof, &trust_anchor.merkle_root, &leaf, leaf_index),
        LatticeError::InvalidMerkleProof
    );

    msg!(
        "LATTICE: Edge verified — trustee={}, dimension={}, weight={}",
        edge_data.trustee,
        edge_data.dimension as u8,
        edge_data.weight
    );

    Ok(())
}
