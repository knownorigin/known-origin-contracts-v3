// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {BaseTokenUriResolver} from "./BaseTokenUriResolver.sol";
import {UrlTools} from "./UrlTools.sol";

contract SingleEditionRevealableTokenIdResolver is BaseTokenUriResolver {

    /*
    1. mint token with base uri
    2. setup resolver with signature to prove no post sale abuse
    3. registry against edition
    4. >>> run the sale/drop
    5. reveal by setting the base uri
    */

    // TODO - include signature of base storage but NOT the update - this proves there was no malicious behaviour as they can be set before the sale
    string joiner;
    string defaultTokenUri;
    string public baseStorageHash;

    function tokenURI(uint256 _editionId, uint256 _tokenId) external override view returns (string memory) {
        if (bytes(baseStorageHash).length > 0) {
            return defaultTokenUri;
        }
        return UrlTools.staticTokenUri(_tokenId, baseStorageHash, joiner);
    }

}
