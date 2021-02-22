// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

/**
 * ERC2981 standards interface for royalties
 */
interface IERC2981 {

    function royaltyInfo(uint256 _tokenId) external returns (address receiver, uint256 amount);

    // TODO: receivedRoyalties(address recipient, address buyer, uint256 tokenId, uint256 amount)
    // EIP alludes to the existence of a method like this in an example but doesn't define it

    // TODO hasRoyaltyDefine() method
}
