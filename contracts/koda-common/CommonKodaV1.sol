//// SPDX-License-Identifier: MIT
//
//pragma solidity 0.8.4;
//
//import {ICommonKoda} from "./ICommonKoda.sol";
//
///**
//* Minimal interface definition for KODA V1 contract calls
//*
//* https://www.knownorigin.io/
//*/
//interface IKODAV1 is IERC721ReadOnly {
//
//    enum PurchaseState {Unsold, EtherPurchase, FiatPurchase}
//
//    function numberOf(bytes16 _edition) external view returns (uint256);
//
//    function assetInfo(uint _tokenId) external view returns (
//        uint256 _tokId,
//        address _owner,
//        PurchaseState _purchaseState,
//        uint256 _priceInWei,
//        uint32 _purchaseFromTime
//    );
//
//    function editionInfo(uint256 _tokenId) external view returns (
//        uint256 _tokId,
//        bytes16 _edition,
//        uint256 _editionNumber,
//        string memory _tokenURI,
//        address _artistAccount
//    );
//}
//contract CommonKodaV1 is ICommonKoda {
//
//    // FIXME V1 (bytes16 _edition) is not unit256 for edition ID?
//
//    IKODAV1 kodaV1;
//
//    constructor(IKODAV1 _kodaV1) {
//        kodaV1 = _kodaV1;
//    }
//
//    function getVersion() external override returns (uint256 _version) {
//        return 1;
//    }
//
//    function editionExists(uint256 _editionId) external override returns (bool _exists) {
//        //        uint256 _editionNumber;
//        //        (_, _, _editionNumber, _, _) = kodaV1.editionInfo(_editionId);
//        //        return _editionNumber > 0;
//        return 0;
//        // FIXME V1 (bytes16 _edition) is not unit256
//    }
//
//    function getCreatorOfEdition(uint256 _editionId) external override returns (address _originalCreator){
//        return 0;
//        // FIXME V1 (bytes16 _edition) is not unit256
//    }
//
//    function getCreatorOfToken(uint256 _tokenId) external override returns (address _originalCreator){
//        address _artistAccount;
//        (,,,, _artistAccount) = kodaV1.editionInfo(_tokenId);
//        return _artistAccount;
//    }
//
//    function getSizeOfEdition(uint256 _editionId) external override returns (uint256 _size){
//        bytes16 _edition;
//        (,, _edition,,) = kodaV1.editionInfo(_editionId);
//        return kodaV1.numberOf(_edition);
//    }
//
//    function getEditionSizeOfToken(uint256 _tokenId) external override returns (uint256 _size){
//        bytes16 _edition;
//        (,, _edition,,) = kodaV1.editionInfo(_tokenId);
//        return kodaV1.numberOf(_edition);
//    }
//
//    function getNextAvailablePrimarySaleToken(uint256 _editionId) external returns (uint256 _tokenId) {
//        // FIXME all sold out ...
//        return 0;
//    }
//
//    //////// common read-only 721
//
//    function balanceOf(address _owner) public override view returns (uint256 _balance) {
//        return kodaV1.balanceOf(_owner);
//    }
//
//    function ownerOf(uint256 _tokenId) public override view returns (address _owner) {
//        return kodaV1.ownerOf(_tokenId);
//    }
//
//    function exists(uint256 _tokenId) public override view returns (bool _exists) {
//        return kodaV1.exists(_tokenId);
//    }
//
//    function getApproved(uint256 _tokenId) public override view returns (address _operator) {
//        return kodaV1.getApproved(_tokenId);
//    }
//
//    function isApprovedForAll(address _owner, address _operator) public override view returns (bool){
//        return kodaV1.isApprovedForAll(_owner, _operator);
//    }
//}
