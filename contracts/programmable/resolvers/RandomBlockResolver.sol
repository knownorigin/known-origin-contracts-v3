// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/GSN/Context.sol";
import "../ITokenUriResolver.sol";

contract RandomBlockResolver is Context, ITokenUriResolver {

    function editionURI(uint256 _editionId) override external view returns (string memory) {
        if (block.timestamp % 2 == 0) {
            return "1";
        }
        return "2";
    }

    function isDefined(uint256) override external view returns (bool) {
        return true;
    }

}
