// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {IKOAccessControlsLookup} from "./IKOAccessControlsLookup.sol";
import {ISelfServiceAccessControls} from "./legacy/ISelfServiceAccessControls.sol";

contract KOAccessControls is AccessControl, IKOAccessControlsLookup {

    event AdminUpdateArtistAccessMerkleRoot(bytes32 _artistAccessMerkleRoot);
    event AdminUpdateArtistAccessMerkleRootIpfsHash(string _artistAccessMerkleRootIpfsHash);

    bytes32 public constant CONTRACT_ROLE = keccak256("CONTRACT_ROLE");

    ISelfServiceAccessControls public legacyMintingAccess;

    // A publicly available root merkle proof
    bytes32 public artistAccessMerkleRoot;

    // A publicly hosted ipfs payload holding the merkle proofs
    string public artistAccessMerkleRootIpfsHash;

    constructor(ISelfServiceAccessControls _legacyMintingAccess) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        legacyMintingAccess = _legacyMintingAccess;
    }

    //////////////////
    // Merkle Magic //
    //////////////////

    function isVerifiedArtist(uint256 index, address account, bytes32[] calldata merkleProof) public override view returns (bool) {
        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(index, account, uint256(1)));
        return MerkleProof.verify(merkleProof, artistAccessMerkleRoot, node);
    }

    /////////////
    // Lookups //
    /////////////

    function hasAdminRole(address _address) external override view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function hasLegacyMinterRole(address _address) external override view returns (bool) {
        return legacyMintingAccess.isEnabledForAccount(_address);
    }

    function hasContractRole(address _address) external override view returns (bool) {
        return hasRole(CONTRACT_ROLE, _address);
    }

    function hasContractOrAdminRole(address _address) external override view returns (bool) {
        return hasRole(CONTRACT_ROLE, _address) || hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    ///////////////
    // Modifiers //
    ///////////////

    function addAdminRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Sender must be an admin to grant role");
        _setupRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function removeAdminRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Sender must be an admin to revoke role");
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function addContractRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Sender must be an admin to grant role");
        _setupRole(CONTRACT_ROLE, _address);
    }

    function removeContractRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Sender must be an admin to revoke role");
        revokeRole(CONTRACT_ROLE, _address);
    }

    function updateArtistMerkleRoot(bytes32 _artistAccessMerkleRoot) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Sender must be an admin");
        artistAccessMerkleRoot = _artistAccessMerkleRoot;
        emit AdminUpdateArtistAccessMerkleRoot(_artistAccessMerkleRoot);
    }

    function updateArtistMerkleRootIpfsHash(string calldata _artistAccessMerkleRootIpfsHash) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Sender must be an admin");
        artistAccessMerkleRootIpfsHash = _artistAccessMerkleRootIpfsHash;
        emit AdminUpdateArtistAccessMerkleRootIpfsHash(_artistAccessMerkleRootIpfsHash);
    }
}
