// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/GSN/Context.sol";
import "../ITokenUriResolver.sol";

contract ContractBalanceFeedResolver is Context, ITokenUriResolver {

    function editionURI(uint256 _editionId) override external view returns (string memory) {
        if (isContractBalanceAboveThreshold()) {
            return "1";
        }
        return "2";
    }

    function isDefined(uint256) override external view returns (bool) {
        return true;
    }

    function isContractBalanceAboveThreshold() internal view returns (bool) {
        return true;
    }

}
