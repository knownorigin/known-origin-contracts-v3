// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

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
    function getEditionCreator(uint256 _editionId) external view returns (address _originalCreator);

    function getEditionCreatorOfToken(uint256 _tokenId) external view returns (address _originalCreator);

    function getEditionSize(uint256 _editionId) external view returns (uint256 _size);

    function getEditionSizeOfToken(uint256 _tokenId) external view returns (uint256 _size);

    function editionExists(uint256 _editionId) external view returns (bool);

    function getEditionIdForToken(uint256 _tokenId) external pure returns (uint256 _editionId);

    function getEditionDetails(uint256 _tokenId) external view returns (address _originalCreator, address _owner, uint256 _editionId, uint256 _size, string memory _uri);
}
