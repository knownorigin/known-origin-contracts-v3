// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {BaseTokenUriResolver} from "./BaseTokenUriResolver.sol";
import {UrlTools} from "./UrlTools.sol";

contract LCRContentBasedResolver is BaseTokenUriResolver {
    using Strings for uint256;

    // Linear Congruential Generator

    string baseStorageHash;
    uint256 offset; // set to deployment block ?
    uint256 prime; // larger the prime the better
    uint256 maxEditionId; // TODO set it on deployment?

    function tokenURI(uint256 _editionId, uint256 _tokenId) external override view returns (string memory) {
        
        // generate a pseudo random number (LCG) between 0 and max edition
        uint256 contentId = (offset + _tokenId * prime) % maxEditionId;

        // {baseStorageHash}{joiner}{tokenId} e.g. ipfs://ipfs/{baseStorageHash}/{id}.json
        return string(abi.encodePacked(baseStorageHash, "/", contentId.toString(), ".json"));
    }

}
