// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ITokenUriResolver} from "../ITokenUriResolver.sol";
import {IKODAV3} from "../../core/IKODAV3.sol";

contract SingleEditionDynamicTokenIdResolver is ITokenUriResolver {
    using Strings for uint256;

    string baseStorageHash;
    string joiner;
    uint16 editionSize;
    bytes salt;

    function tokenURI(uint256, uint256) external override view returns (string memory) {
        // {baseStorageHash}{joiner}{sudo random number generator between 0 and edition size thats based on token ID?}
        return "";
    }

    function isDefined(uint256, uint256) external override view returns (bool) {
        return true;
    }
}
