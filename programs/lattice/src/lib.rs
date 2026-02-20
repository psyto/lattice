use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::TrustEdgeData;

declare_id!("3n7dwHVkdNCFGt5ghN4ajVD3YAVRH5oDBxJJftu5aGJC");

#[program]
pub mod lattice {
    use super::*;

    /// Initialize trust anchor for a user
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// Update merkle root after modifying trust edges off-chain
    pub fn update_root(
        ctx: Context<UpdateRoot>,
        new_root: [u8; 32],
        new_count: u16,
    ) -> Result<()> {
        instructions::update_root::handler(ctx, new_root, new_count)
    }

    /// Verify a trust edge exists (on-chain verification for other programs via CPI)
    pub fn verify_edge(
        ctx: Context<VerifyEdge>,
        edge_data: TrustEdgeData,
        proof: Vec<[u8; 32]>,
        leaf_index: u32,
    ) -> Result<()> {
        instructions::verify_edge::handler(ctx, edge_data, proof, leaf_index)
    }
}
