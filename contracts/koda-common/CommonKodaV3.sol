// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {ICommonKoda} from "./ICommonKoda.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

contract CommonKodaV2 is ICommonKoda {

    IKODAV3 kodaV3;

    constructor(IKODAV3 _kodaV3) {
        kodaV3 = _kodaV3;
    }

    function getVersion() external pure override returns (uint256 _version) {
        return 3;
    }

    function editionExists(uint256 _editionId) external view override returns (bool _exists) {
        return kodaV3.editionExists(_editionId);
    }

    function getCreatorOfEdition(uint256 _editionId) external view override returns (address _originalCreator){
        return kodaV3.getCreatorOfEdition(_editionId);
    }

    function getCreatorOfToken(uint256 _tokenId) external view override returns (address _originalCreator) {
        return kodaV3.getCreatorOfToken(_tokenId);
    }

    function getSizeOfEdition(uint256 _editionId) external view override returns (uint256 _size) {
        return kodaV3.getSizeOfEdition(_editionId);
    }

    function getEditionSizeOfToken(uint256 _tokenId) external view override returns (uint256 _size) {
        return kodaV3.getEditionSizeOfToken(_tokenId);
    }

    function getNextAvailablePrimarySaleToken(uint256 _editionId) external override returns (uint256 _tokenId){
        return kodaV3.getNextAvailablePrimarySaleToken(_editionId);
    }

    //////// common read-only 721

    function balanceOf(address _owner) external view override returns (uint256 _balance) {
        return kodaV3.balanceOf(_owner);
    }

    function ownerOf(uint256 _tokenId) external view override returns (address _owner) {
        return kodaV3.ownerOf(_tokenId);
    }

    function exists(uint256 _tokenId) external view override returns (bool _exists) {
        return kodaV3.exists(_tokenId);
    }

    function getApproved(uint256 _tokenId) external view override returns (address _operator) {
        return kodaV3.getApproved(_tokenId);
    }

    function isApprovedForAll(address _owner, address _operator) external view override returns (bool){
        return kodaV3.isApprovedForAll(_owner, _operator);
    }
}
