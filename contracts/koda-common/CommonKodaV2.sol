// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {ICommonKoda} from "./ICommonKoda.sol";
import {IKODAV2} from "./IKODAV2.sol";

contract CommonKodaV2 is ICommonKoda {

    IKODAV2 kodaV2;

    constructor(IKODAV2 _kodaV2) {
        kodaV2 = _kodaV2;
    }

    function getVersion() external pure override returns (uint256 _version) {
        return 2;
    }

    function editionExists(uint256 _editionId) external view override returns (bool _exists) {
        return kodaV2.editionExists(_editionId);
    }

    function getCreatorOfEdition(uint256 _editionId) external view override returns (address _originalCreator){
        address artistAccount;
        (artistAccount,) = kodaV2.artistCommission(_editionId);
        return artistAccount;
    }

    function getCreatorOfToken(uint256 _tokenId) external view override returns (address _originalCreator){
        uint256 _editionId = kodaV2.editionOfTokenId(_tokenId);
        address artistAccount;
        (artistAccount,) = kodaV2.artistCommission(_editionId);
        return artistAccount;
    }

    function getSizeOfEdition(uint256 _editionId) external view override returns (uint256 _size){
        return kodaV2.totalAvailableEdition(_editionId);
    }

    function getEditionSizeOfToken(uint256 _tokenId) external view override returns (uint256 _size){
        uint256 _editionId = kodaV2.editionOfTokenId(_tokenId);
        return kodaV2.totalAvailableEdition(_editionId);
    }

    function getNextAvailablePrimarySaleToken(uint256 _editionId) external view override returns (uint256 _tokenId){
        uint256 totalSupply = kodaV2.totalSupplyEdition(_editionId);
        // Construct next token ID e.g. 100000 + 1 = ID of 100001 (this first in the edition set)
        return _editionId + totalSupply + 1;
    }

    //////// common read-only 721

    function balanceOf(address _owner) external override view returns (uint256 _balance) {
        return kodaV2.balanceOf(_owner);
    }

    function ownerOf(uint256 _tokenId) external override view returns (address _owner) {
        return kodaV2.ownerOf(_tokenId);
    }

    function exists(uint256 _tokenId) external override view returns (bool _exists) {
        return kodaV2.exists(_tokenId);
    }

    function getApproved(uint256 _tokenId) external override view returns (address _operator) {
        return kodaV2.getApproved(_tokenId);
    }

    function isApprovedForAll(address _owner, address _operator) external override view returns (bool){
        return kodaV2.isApprovedForAll(_owner, _operator);
    }
}
