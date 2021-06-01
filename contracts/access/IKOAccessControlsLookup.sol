// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

interface IKOAccessControlsLookup {
    function hasAdminRole(address _address) external view returns (bool);

    function isVerifiedArtist(uint256 index, address account, bytes32[] calldata merkleProof) external view returns (bool);

    function isVerifiedArtistProxy(address account) external view returns (bool);

    function hasLegacyMinterRole(address _address) external view returns (bool);

    function hasContractRole(address _address) external view returns (bool);

    function hasContractOrAdminRole(address _address) external view returns (bool);
}
