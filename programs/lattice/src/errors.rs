use anchor_lang::prelude::*;

#[error_code]
pub enum LatticeError {
    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,
    #[msg("Trust weight must be between 0 and 10000")]
    InvalidTrustWeight,
    #[msg("Edge count overflow")]
    EdgeCountOverflow,
}
