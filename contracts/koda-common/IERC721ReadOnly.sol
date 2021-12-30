// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IERC721ReadOnly {
    function balanceOf(address _owner) external view returns (uint256 _balance);
    function ownerOf(uint256 _tokenId) external view returns (address _owner);
    function exists(uint256 _tokenId) external view returns (bool _exists);
    function getApproved(uint256 _tokenId) external view returns (address _operator);
    function isApprovedForAll(address _owner, address _operator) external view returns (bool);
}
