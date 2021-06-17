// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

interface IERC721Ownable {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}
