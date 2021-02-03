// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

//solhint-disable max-line-length
//solhint-disable no-inline-assembly

contract Konstants {

    uint256 public constant MAX_EDITION_SIZE = 1000;

    // magic method that defines the maximum range for an edition - this is fix forever - tokens are minted in range
    function _editionFromTokenId(uint256 _tokenId) internal pure returns (uint256) {
        uint256 editionId = (_tokenId / MAX_EDITION_SIZE) * MAX_EDITION_SIZE;
        return editionId;
    }
}