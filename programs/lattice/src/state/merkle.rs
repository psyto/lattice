use solana_program::keccak;

/// Domain separation prefixes for the Stratum Merkle pattern.
/// Prevents second pre-image attacks by distinguishing leaves from internal nodes.
const LEAF_PREFIX: [u8; 1] = [0x00];
const NODE_PREFIX: [u8; 1] = [0x01];

/// Hash a leaf node with domain separation.
/// leaf_hash = keccak256(0x00 || data)
pub fn hash_leaf(data: &[u8]) -> [u8; 32] {
    let mut input = Vec::with_capacity(1 + data.len());
    input.extend_from_slice(&LEAF_PREFIX);
    input.extend_from_slice(data);
    keccak::hash(&input).to_bytes()
}

/// Hash two child nodes into a parent node with domain separation.
/// node_hash = keccak256(0x01 || left || right)
pub fn hash_nodes(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut input = Vec::with_capacity(1 + 32 + 32);
    input.extend_from_slice(&NODE_PREFIX);
    input.extend_from_slice(left);
    input.extend_from_slice(right);
    keccak::hash(&input).to_bytes()
}

/// Verify a Merkle proof against a known root.
///
/// # Arguments
/// * `proof` - The sibling hashes along the path from leaf to root
/// * `root` - The expected Merkle root
/// * `leaf` - The leaf hash to verify
/// * `index` - The leaf's position in the tree (determines left/right at each level)
///
/// # Returns
/// `true` if the proof is valid, `false` otherwise
pub fn verify_proof(proof: &[[u8; 32]], root: &[u8; 32], leaf: &[u8; 32], index: u32) -> bool {
    let mut computed = *leaf;
    let mut idx = index;

    for sibling in proof.iter() {
        if idx % 2 == 0 {
            // Current node is on the left, sibling is on the right
            computed = hash_nodes(&computed, sibling);
        } else {
            // Current node is on the right, sibling is on the left
            computed = hash_nodes(sibling, &computed);
        }
        idx /= 2;
    }

    computed == *root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_leaf_hash_domain_separation() {
        let data = b"test_data";
        let leaf = hash_leaf(data);
        // A leaf hash should differ from a raw keccak of the same data
        let raw = keccak::hash(data).to_bytes();
        assert_ne!(leaf, raw);
    }

    #[test]
    fn test_node_hash_domain_separation() {
        let left = [1u8; 32];
        let right = [2u8; 32];
        let node = hash_nodes(&left, &right);
        // Should differ from hashing without the prefix
        let mut raw_input = Vec::new();
        raw_input.extend_from_slice(&left);
        raw_input.extend_from_slice(&right);
        let raw = keccak::hash(&raw_input).to_bytes();
        assert_ne!(node, raw);
    }

    #[test]
    fn test_verify_single_leaf_tree() {
        // A tree with a single leaf: root == leaf_hash, empty proof
        let data = b"single_leaf";
        let leaf = hash_leaf(data);
        let root = leaf;
        assert!(verify_proof(&[], &root, &leaf, 0));
    }

    #[test]
    fn test_verify_two_leaf_tree() {
        let leaf0 = hash_leaf(b"leaf_0");
        let leaf1 = hash_leaf(b"leaf_1");
        let root = hash_nodes(&leaf0, &leaf1);

        // Prove leaf0 (index 0): sibling is leaf1
        assert!(verify_proof(&[leaf1], &root, &leaf0, 0));
        // Prove leaf1 (index 1): sibling is leaf0
        assert!(verify_proof(&[leaf0], &root, &leaf1, 1));
    }

    #[test]
    fn test_verify_invalid_proof() {
        let leaf0 = hash_leaf(b"leaf_0");
        let leaf1 = hash_leaf(b"leaf_1");
        let root = hash_nodes(&leaf0, &leaf1);

        // Wrong sibling
        let fake_sibling = [0u8; 32];
        assert!(!verify_proof(&[fake_sibling], &root, &leaf0, 0));
    }

    #[test]
    fn test_verify_four_leaf_tree() {
        let leaf0 = hash_leaf(b"leaf_0");
        let leaf1 = hash_leaf(b"leaf_1");
        let leaf2 = hash_leaf(b"leaf_2");
        let leaf3 = hash_leaf(b"leaf_3");

        let node01 = hash_nodes(&leaf0, &leaf1);
        let node23 = hash_nodes(&leaf2, &leaf3);
        let root = hash_nodes(&node01, &node23);

        // Prove leaf0 (index 0): siblings are leaf1, node23
        assert!(verify_proof(&[leaf1, node23], &root, &leaf0, 0));
        // Prove leaf2 (index 2): siblings are leaf3, node01
        assert!(verify_proof(&[leaf3, node01], &root, &leaf2, 2));
        // Prove leaf3 (index 3): siblings are leaf2, node01
        assert!(verify_proof(&[leaf2, node01], &root, &leaf3, 3));
    }
}
