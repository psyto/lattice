import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { TrustAnchor, TrustEdge, TrustDimension } from './types';
import { getTrustAnchorPda, LATTICE_PROGRAM_ID } from './pda';
import { TrustEdgeStore, serializeTrustEdge } from './merkle';

// =============================================================================
// LATTICE Client — On-Chain Trust Graph Operations
// =============================================================================

/**
 * LATTICE SDK Client
 * Manages on-chain TrustAnchor accounts and off-chain edge stores
 */
export class LatticeClient {
  public program: Program | null;
  public provider: AnchorProvider;

  constructor(provider: AnchorProvider, idl?: Idl) {
    this.provider = provider;
    this.program = idl ? new Program(idl, provider) : null;
  }

  private requireProgram(): Program {
    if (!this.program) {
      throw new Error('LatticeClient: program not initialized — pass IDL to constructor');
    }
    return this.program;
  }

  // ============================================
  // Static PDA helpers
  // ============================================

  static getTrustAnchorPda = getTrustAnchorPda;
  static PROGRAM_ID = LATTICE_PROGRAM_ID;

  // ============================================
  // Read Operations
  // ============================================

  /**
   * Get a user's TrustAnchor account
   */
  async getTrustAnchor(owner: PublicKey): Promise<TrustAnchor | null> {
    const [pda] = getTrustAnchorPda(owner);
    try {
      const account = await (this.requireProgram().account as any).trustAnchor.fetch(pda);
      return {
        owner: account.owner as PublicKey,
        merkleRoot: new Uint8Array(account.merkleRoot as number[]),
        edgeCount: account.edgeCount as number,
        lastUpdated: (account.lastUpdated as any).toNumber(),
        createdAt: (account.createdAt as any).toNumber(),
        bump: account.bump as number,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a user has a TrustAnchor
   */
  async hasTrustAnchor(owner: PublicKey): Promise<boolean> {
    const anchor = await this.getTrustAnchor(owner);
    return anchor !== null;
  }

  /**
   * Read TrustAnchor directly from account data (no Anchor IDL needed)
   * Layout: 8(disc) + 32(owner) + 32(root) + 2(count) + 8(updated) + 8(created) + 1(bump)
   */
  static async readTrustAnchorRaw(
    connection: Connection,
    owner: PublicKey,
  ): Promise<TrustAnchor | null> {
    const [pda] = getTrustAnchorPda(owner);
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo || accountInfo.data.length < 91) return null;

    const data = accountInfo.data;
    return {
      owner: new PublicKey(data.subarray(8, 40)),
      merkleRoot: new Uint8Array(data.subarray(40, 72)),
      edgeCount: data.readUInt16LE(72),
      lastUpdated: Number(data.readBigInt64LE(74)),
      createdAt: Number(data.readBigInt64LE(82)),
      bump: data.readUInt8(90),
    };
  }

  // ============================================
  // Write Operations
  // ============================================

  /**
   * Initialize a TrustAnchor for the connected wallet
   */
  async initialize(): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [trustAnchor] = getTrustAnchorPda(owner);

    return this.requireProgram().methods
      .initialize()
      .accounts({
        owner,
        trustAnchor,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Update the Merkle root after modifying trust edges off-chain
   * @param store - The TrustEdgeStore containing all edges
   */
  async updateRoot(store: TrustEdgeStore): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [trustAnchor] = getTrustAnchorPda(owner);

    const root = Array.from(store.getRoot());
    const count = store.edgeCount;

    return this.requireProgram().methods
      .updateRoot(root, count)
      .accounts({
        owner,
        trustAnchor,
      })
      .rpc();
  }

  /**
   * Verify a trust edge on-chain (used by other programs via CPI)
   * @param anchorOwner - Owner of the TrustAnchor to verify against
   * @param edge - The trust edge to verify
   * @param store - The edge store containing the proof
   */
  async verifyEdge(
    anchorOwner: PublicKey,
    edge: TrustEdge,
    store: TrustEdgeStore,
  ): Promise<string> {
    const [trustAnchor] = getTrustAnchorPda(anchorOwner);
    const proofData = store.getProof(edge.trustee, edge.dimension);
    if (!proofData) throw new Error('Edge not found in store');

    const edgeData = {
      trustee: edge.trustee,
      dimension: { [['trading', 'civic', 'developer', 'infra', 'creator'][edge.dimension]]: {} },
      weight: edge.weight,
      createdAt: edge.createdAt,
    };

    const proofArray = proofData.proof.map((buf) => Array.from(buf));

    return this.requireProgram().methods
      .verifyEdge(edgeData, proofArray, proofData.index)
      .accounts({
        trustAnchor,
      })
      .rpc();
  }

  // ============================================
  // Convenience: Full Edge Management Workflow
  // ============================================

  /**
   * Add a trust edge and update the on-chain root
   * Full workflow: add to store → rebuild tree → update on-chain root
   */
  async addEdgeAndCommit(
    store: TrustEdgeStore,
    trustee: PublicKey,
    dimension: TrustDimension,
    weight: number,
  ): Promise<{ signature: string; store: TrustEdgeStore }> {
    store.addEdge({
      trustee,
      dimension,
      weight,
      createdAt: Math.floor(Date.now() / 1000),
    });

    const signature = await this.updateRoot(store);
    return { signature, store };
  }

  /**
   * Remove a trust edge and update the on-chain root
   */
  async removeEdgeAndCommit(
    store: TrustEdgeStore,
    trustee: PublicKey,
    dimension: TrustDimension,
  ): Promise<{ signature: string; store: TrustEdgeStore; removed: boolean }> {
    const removed = store.removeEdge(trustee, dimension);
    const signature = await this.updateRoot(store);
    return { signature, store, removed };
  }
}
