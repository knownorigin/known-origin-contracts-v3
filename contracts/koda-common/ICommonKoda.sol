// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {IERC721ReadOnly} from "../koda-common/IERC721ReadOnly.sol";

interface ICommonKoda is IERC721ReadOnly {

    /////// version

    function getVersion() external view returns (uint256 _version);

    ////// KODA Common

    function editionExists(uint256 _editionId) external view returns (bool _exists);

    function getCreatorOfEdition(uint256 _editionId) external view returns (address _originalCreator);

    function getCreatorOfToken(uint256 _tokenId) external view returns (address _originalCreator);

    function getSizeOfEdition(uint256 _editionId) external view returns (uint256 _size);

    function getEditionSizeOfToken(uint256 _tokenId) external view returns (uint256 _size);

    function getNextAvailablePrimarySaleToken(uint256 _editionId) external returns (uint256 _tokenId);

}
