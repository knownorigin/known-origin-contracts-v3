// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;

import "./IERC2309.sol";
import "../royalties/IERC2981.sol";
import "@openzeppelin/contracts/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IKODAV3 is
IERC165, // contract introspection
IERC721, // NFTs
IERC2309, // Consecutive batch mint (optional)
IERC2981  // royalties
{

}
