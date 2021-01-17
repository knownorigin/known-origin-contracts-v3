// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;

/**
 * ERC2981 standards interface for royalties
 */
interface IERC2981 {

    function royaltyInfo(uint256 _tokenId) external returns (address receiver, uint256 amount);
}
