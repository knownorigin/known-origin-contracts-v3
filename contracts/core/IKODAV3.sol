// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./IERC2309.sol";
import "./IERC2981.sol";

interface IKODAV3 is
IERC165, // Contract introspection
IERC721, // NFTs
IERC2309, // Consecutive batch mint
IERC2981  // Royalties
{
    ///////////////////
    // edition utils //
    ///////////////////

    function getCreatorOfEdition(uint256 _editionId) external view returns (address _originalCreator);

    function getCreatorOfToken(uint256 _tokenId) external view returns (address _originalCreator);

    function getSizeOfEdition(uint256 _editionId) external view returns (uint256 _size);

    function getEditionSizeOfToken(uint256 _tokenId) external view returns (uint256 _size);

    function editionExists(uint256 _editionId) external view returns (bool);

    function maxTokenIdOfEdition(uint256 _editionId) external view returns (uint256 _tokenId);

    function getNextAvailablePrimarySaleToken(uint256 _editionId) external returns (uint256 _tokenId);

    // Utility method to get all data needed for the next primary sale
    function facilitateNextPrimarySale(uint256 _editionId) external returns (address _receiver, address _creator, uint256 _tokenId);

    // Expanded royalty method for the edition, not token
    function royaltyAndCreatorInfo(uint256 _editionId) external returns (address _receiver, address _creator, uint256 _amount);

    /////////////////
    // token utils //
    /////////////////

    function exists(uint256 _tokenId) external view returns (bool);

    function getEditionIdOfToken(uint256 _tokenId) external pure returns (uint256 _editionId);

    function getEditionDetails(uint256 _tokenId) external view returns (address _originalCreator, address _owner, uint256 _editionId, uint256 _size, string memory _uri);

    function hadPrimarySaleOfToken(uint256 _tokenId) external view returns (bool);
}
