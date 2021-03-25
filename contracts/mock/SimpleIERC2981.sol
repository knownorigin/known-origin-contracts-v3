// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IERC2981} from "../core/IERC2981.sol";

// N:B: Mock contract for testing purposes only
contract SimpleIERC2981 is ERC165, IERC2981 {

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

    function hasRoyalties(uint256 _tokenId) external override view returns (bool) {
        return tokenIdToReceiver[_tokenId] != address(0);
    }

    function receivedRoyalties(address _royaltyRecipient, address _buyer, uint256 _tokenId, address _tokenPaid, uint256 _amount)
    external
    override {
        emit ReceivedRoyalties(_royaltyRecipient, _buyer, _tokenId, _tokenPaid, _amount);
    }
}
