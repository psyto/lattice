use anchor_lang::prelude::*;

use crate::errors::LatticeError;
use crate::state::TrustAnchor;

#[derive(Accounts)]
pub struct UpdateRoot<'info> {
    #[account(
        mut,
        seeds = [b"trust", owner.key().as_ref()],
        bump = trust_anchor.bump,
        has_one = owner,
    )]
    pub trust_anchor: Account<'info, TrustAnchor>,

    pub owner: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateRoot>, new_root: [u8; 32], new_count: u16) -> Result<()> {
    let trust_anchor = &mut ctx.accounts.trust_anchor;
    let clock = Clock::get()?;

    // Guard against edge count overflow (u16::MAX = 65535 edges per user)
    require!(new_count > 0 || new_root == [0u8; 32], LatticeError::EdgeCountOverflow);

    trust_anchor.merkle_root = new_root;
    trust_anchor.edge_count = new_count;
    trust_anchor.last_updated = clock.unix_timestamp;

    msg!(
        "LATTICE: Root updated for {} — {} edges",
        ctx.accounts.owner.key(),
        new_count
    );

    Ok(())
}
