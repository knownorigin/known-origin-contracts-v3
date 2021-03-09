// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Context} from "@openzeppelin/contracts/GSN/Context.sol";
import {MerkleProof} from "@openzeppelin/contracts/cryptography/MerkleProof.sol";

import {IKOAccessControlsLookup} from "./IKOAccessControlsLookup.sol";
import {ISelfServiceAccessControls} from "./legacy/ISelfServiceAccessControls.sol";

contract KOAccessControls is AccessControl, IKOAccessControlsLookup {

    bytes32 public constant CONTRACT_ROLE = keccak256("CONTRACT_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    ISelfServiceAccessControls public legacyMintingAccess;

    bytes32 public artistAccessMerkleRoot;

    constructor(ISelfServiceAccessControls _legacyMintingAccess) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
        legacyMintingAccess = _legacyMintingAccess;
    }

    //////////////////
    // Merkle Magic //
    //////////////////

    function isVerifiedArtist(uint256 index, address account, bytes32[] calldata merkleProof) public view returns (bool) {
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

    function hasMinterRole(address _address) external override view returns (bool) {
        return hasRole(MINTER_ROLE, _address) || legacyMintingAccess.isEnabledForAccount(_address);
    }

    function hasContractRole(address _address) external override view returns (bool) {
        return hasRole(CONTRACT_ROLE, _address);
    }

    function hasContractOrMinterRole(address _address) external override view returns (bool) {
        return hasRole(CONTRACT_ROLE, _address) || hasRole(MINTER_ROLE, _address);
    }

    function hasContractOrAdminRole(address _address) external override view returns (bool) {
        return hasRole(CONTRACT_ROLE, _address) || hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    ///////////////
    // Modifiers //
    ///////////////

    function addAdminRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to grant role");
        _setupRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function removeAdminRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to revoke role");
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function addMinterRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to grant role");
        _setupRole(MINTER_ROLE, _address);
    }

    function removeMinterRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to revoke role");
        revokeRole(MINTER_ROLE, _address);
    }

    function addContractRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to grant role");
        _setupRole(CONTRACT_ROLE, _address);
    }

    function removeContractRole(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to revoke role");
        revokeRole(CONTRACT_ROLE, _address);
    }

    function updateArtistMerkleRoot(bytes32 _artistAccessMerkleRoot) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin");
        artistAccessMerkleRoot = _artistAccessMerkleRoot;
    }

}
