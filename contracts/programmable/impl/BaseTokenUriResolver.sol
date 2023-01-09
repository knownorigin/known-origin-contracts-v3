// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {ITokenUriResolver} from "../ITokenUriResolver.sol";

abstract contract BaseTokenUriResolver is ITokenUriResolver {
    function isDefined(uint256, uint256) external override view returns (bool) {
        return true;
    }
}
