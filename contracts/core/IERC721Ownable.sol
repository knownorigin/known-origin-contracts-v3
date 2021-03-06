// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

interface IERC721Ownable {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}
