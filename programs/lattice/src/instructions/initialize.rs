use anchor_lang::prelude::*;

use crate::state::TrustAnchor;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = TrustAnchor::SIZE,
        seeds = [b"trust", owner.key().as_ref()],
        bump,
    )]
    pub trust_anchor: Account<'info, TrustAnchor>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let trust_anchor = &mut ctx.accounts.trust_anchor;
    let clock = Clock::get()?;

    trust_anchor.owner = ctx.accounts.owner.key();
    trust_anchor.merkle_root = [0u8; 32];
    trust_anchor.edge_count = 0;
    trust_anchor.last_updated = clock.unix_timestamp;
    trust_anchor.created_at = clock.unix_timestamp;
    trust_anchor.bump = ctx.bumps.trust_anchor;

    msg!(
        "LATTICE: Trust anchor initialized for {}",
        ctx.accounts.owner.key()
    );

    Ok(())
}
