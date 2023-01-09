// SPDX-License-Identifier: MIT

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

pragma solidity 0.8.4;

library UrlTools {
    using Strings for uint256;

    function staticTokenUri(uint256 tokenId, string memory baseStorageHash, string memory joiner)
    internal
    pure
    returns (string memory) {
        // {baseStorageHash}{joiner}{tokenId} e.g. ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv/1234
        return string(abi.encodePacked(baseStorageHash, joiner, tokenId.toString()));
    }
}
