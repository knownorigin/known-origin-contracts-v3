// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../core/IERC2981.sol";

contract SimpleIERC2981 is IERC2981 {

    mapping(uint256 => uint256) internal tokenIdToAmount;
    mapping(uint256 => address) internal tokenIdToReceiver;

    constructor(uint256[] memory tokenIds, address[] memory receivers, uint256[] memory amounts) {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenIdToReceiver[tokenIds[i]] = receivers[i];
            tokenIdToAmount[tokenIds[i]] = amounts[i];
        }
    }

    /**
     * @notice Called to return both the creator"s address and the royalty percentage
     *          this would be the main function called by marketplaces unless they specifically need just the royaltyAmount
     * @notice Percentage is calculated as a fixed point with a scaling factor of 10,000,
     *          such that 100% would be the value (1000000) where, 1000000/10000 = 100. 1% * would be the value 10000/10000 = 1
     */
    function royaltyInfo(uint256 _tokenId) override external view returns (address receiver, uint256 amount) {
        return (tokenIdToReceiver[_tokenId], tokenIdToAmount[_tokenId]);
    }
}
