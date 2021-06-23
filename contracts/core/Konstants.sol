// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

contract Konstants {

    // Every edition always goes up in batches of 1000
    uint256 public constant MAX_EDITION_SIZE = 1000;

    // Max Edition ID KO can handle with this contract
    uint96 public constant MAX_EDITION_ID = ~uint96(0);

    // magic method that defines the maximum range for an edition - this is fixed forever - tokens are minted in range
    function _editionFromTokenId(uint256 _tokenId) internal pure returns (uint256) {
        return (_tokenId / MAX_EDITION_SIZE) * MAX_EDITION_SIZE;
    }
}
