// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {BaseTokenUriResolver} from "./BaseTokenUriResolver.sol";
import {UrlTools} from "./UrlTools.sol";

contract SingleEditionStaticTokenIdResolver is BaseTokenUriResolver {

    string joiner;
    string public baseStorageHash;

    function tokenURI(uint256 _editionId, uint256 _tokenId) external override view returns (string memory) {
        return UrlTools.staticTokenUri(_tokenId, baseStorageHash, joiner);
    }
}
