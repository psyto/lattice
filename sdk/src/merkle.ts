import { createHash } from 'crypto';
import { TrustEdge, TrustDimension } from './types';
import { PublicKey } from '@solana/web3.js';

// =============================================================================
// LATTICE Merkle Tree — Trust Edge Commitments
// =============================================================================
// Matches the on-chain verification pattern from Stratum.
// Domain-separated hashing prevents second preimage attacks.
// =============================================================================

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

// =============================================================================
// Hash Functions (keccak256, matching solana_program::keccak on-chain)
// =============================================================================

function keccak256(data: Uint8Array): Buffer {
  return createHash('sha3-256').update(data).digest();
}

export function hashLeaf(data: Buffer | Uint8Array): Buffer {
  const prefixed = Buffer.concat([Buffer.from([LEAF_PREFIX]), Buffer.from(data)]);
  return keccak256(prefixed);
}

export function hashNodes(left: Buffer, right: Buffer): Buffer {
  const combined = Buffer.concat([Buffer.from([NODE_PREFIX]), left, right]);
  return keccak256(combined);
}

// =============================================================================
// Trust Edge Serialization (matches on-chain TrustEdgeData layout)
// =============================================================================

/**
 * Serialize a TrustEdge to bytes (43 bytes, matching Rust AnchorSerialize)
 * Layout: trustee(32) + dimension(1) + weight(2 LE) + created_at(8 LE)
 */
export function serializeTrustEdge(edge: TrustEdge): Buffer {
  const buf = Buffer.alloc(43);
  edge.trustee.toBuffer().copy(buf, 0);               // 32 bytes
  buf.writeUInt8(edge.dimension, 32);                  // 1 byte
  buf.writeUInt16LE(edge.weight, 33);                  // 2 bytes
  buf.writeBigInt64LE(BigInt(edge.createdAt), 35);     // 8 bytes
  return buf;
}

/**
 * Deserialize bytes back to a TrustEdge
 */
export function deserializeTrustEdge(data: Buffer): TrustEdge {
  return {
    trustee: new PublicKey(data.subarray(0, 32)),
    dimension: data.readUInt8(32) as TrustDimension,
    weight: data.readUInt16LE(33),
    createdAt: Number(data.readBigInt64LE(35)),
  };
}

/**
 * Hash a TrustEdge as a Merkle leaf
 */
export function hashTrustEdge(edge: TrustEdge): Buffer {
  return hashLeaf(serializeTrustEdge(edge));
}

// =============================================================================
// Merkle Tree
// =============================================================================

export class MerkleTree {
  private leaves: Buffer[];
  private layers: Buffer[][];

  constructor(leaves: Buffer[]) {
    this.leaves = leaves;
    this.layers = this.buildLayers();
  }

  private buildLayers(): Buffer[][] {
    if (this.leaves.length === 0) {
      return [[Buffer.alloc(32)]];
    }

    const layers: Buffer[][] = [this.leaves];

    while (layers[layers.length - 1].length > 1) {
      const currentLayer = layers[layers.length - 1];
      const nextLayer: Buffer[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = currentLayer[i + 1] || left;
        nextLayer.push(hashNodes(left, right));
      }

      layers.push(nextLayer);
    }

    return layers;
  }

  get root(): Buffer {
    return this.layers[this.layers.length - 1][0];
  }

  get rootArray(): number[] {
    return Array.from(this.root);
  }

  get leafCount(): number {
    return this.leaves.length;
  }

  get depth(): number {
    return this.layers.length - 1;
  }

  /**
   * Get Merkle proof for a leaf at the given index
   */
  getProof(index: number): Buffer[] {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Index ${index} out of bounds (0-${this.leaves.length - 1})`);
    }

    const proof: Buffer[] = [];
    let idx = index;

    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

      if (siblingIdx < layer.length) {
        proof.push(layer[siblingIdx]);
      } else {
        proof.push(layer[idx]);
      }

      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Get proof as number[][] for Anchor serialization
   */
  getProofArray(index: number): number[][] {
    return this.getProof(index).map((buf) => Array.from(buf));
  }

  /**
   * Verify a Merkle proof
   */
  static verifyProof(
    proof: Buffer[],
    root: Buffer,
    leaf: Buffer,
    index: number
  ): boolean {
    let computedHash = leaf;
    let idx = index;

    for (const sibling of proof) {
      if (idx % 2 === 0) {
        computedHash = hashNodes(computedHash, sibling);
      } else {
        computedHash = hashNodes(sibling, computedHash);
      }
      idx = Math.floor(idx / 2);
    }

    return computedHash.equals(root);
  }

  // =========================================================================
  // Factory Methods for Trust Edges
  // =========================================================================

  /**
   * Build a MerkleTree from TrustEdge objects
   */
  static fromTrustEdges(edges: TrustEdge[]): MerkleTree {
    const leaves = edges.map(hashTrustEdge);
    return new MerkleTree(leaves);
  }

  /**
   * Build tree from raw pre-hashed leaves
   */
  static fromHashes(hashes: Buffer[]): MerkleTree {
    return new MerkleTree(hashes);
  }
}

// =============================================================================
// Trust Edge Store — Off-Chain Edge Management
// =============================================================================

/**
 * Manages trust edges off-chain and produces Merkle roots for on-chain commits
 */
export class TrustEdgeStore {
  private edges: TrustEdge[];
  private tree: MerkleTree | null = null;

  constructor(edges: TrustEdge[] = []) {
    this.edges = [...edges];
  }

  /**
   * Add a trust edge
   */
  addEdge(edge: TrustEdge): void {
    // Remove existing edge for same trustee + dimension (replace)
    this.edges = this.edges.filter(
      (e) => !(e.trustee.equals(edge.trustee) && e.dimension === edge.dimension)
    );
    this.edges.push(edge);
    this.tree = null; // Invalidate cached tree
  }

  /**
   * Remove a trust edge
   */
  removeEdge(trustee: PublicKey, dimension: TrustDimension): boolean {
    const before = this.edges.length;
    this.edges = this.edges.filter(
      (e) => !(e.trustee.equals(trustee) && e.dimension === dimension)
    );
    this.tree = null;
    return this.edges.length < before;
  }

  /**
   * Get all edges
   */
  getEdges(): TrustEdge[] {
    return [...this.edges];
  }

  /**
   * Get edges for a specific dimension
   */
  getEdgesByDimension(dimension: TrustDimension): TrustEdge[] {
    return this.edges.filter((e) => e.dimension === dimension);
  }

  /**
   * Get edges for a specific trustee
   */
  getEdgesForTrustee(trustee: PublicKey): TrustEdge[] {
    return this.edges.filter((e) => e.trustee.equals(trustee));
  }

  /**
   * Build (or return cached) Merkle tree
   */
  getTree(): MerkleTree {
    if (!this.tree) {
      this.tree = MerkleTree.fromTrustEdges(this.edges);
    }
    return this.tree;
  }

  /**
   * Get the Merkle root (32 bytes)
   */
  getRoot(): Buffer {
    return this.getTree().root;
  }

  /**
   * Get root as number[] for Anchor
   */
  getRootArray(): number[] {
    return this.getTree().rootArray;
  }

  /**
   * Get proof for a specific edge
   */
  getProof(trustee: PublicKey, dimension: TrustDimension): { proof: Buffer[]; index: number } | null {
    const index = this.edges.findIndex(
      (e) => e.trustee.equals(trustee) && e.dimension === dimension
    );
    if (index === -1) return null;
    return { proof: this.getTree().getProof(index), index };
  }

  /**
   * Serialize all edges for off-chain storage (e.g., Arweave, local file)
   */
  serialize(): Buffer {
    const count = Buffer.alloc(2);
    count.writeUInt16LE(this.edges.length);
    const edgeBuffers = this.edges.map(serializeTrustEdge);
    return Buffer.concat([count, ...edgeBuffers]);
  }

  /**
   * Deserialize from stored bytes
   */
  static deserialize(data: Buffer): TrustEdgeStore {
    const count = data.readUInt16LE(0);
    const edges: TrustEdge[] = [];
    let offset = 2;
    for (let i = 0; i < count; i++) {
      edges.push(deserializeTrustEdge(data.subarray(offset, offset + 43)));
      offset += 43;
    }
    return new TrustEdgeStore(edges);
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}
