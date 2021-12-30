// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {ICommonKoda} from "../koda-common/ICommonKoda.sol";

contract CommonKodaAdaptor is Context {

    // Only admin defined in the access controls contract
    modifier onlyAdmin() {
        require(accessControls.hasAdminRole(_msgSender()), "Caller not admin");
        _;
    }

    /// @notice Address of the access control contract
    IKOAccessControlsLookup public accessControls;

    /// @notice Common KODA interface
    ICommonKoda public commonKoda;

    /// @notice mapping of KODA contract to common adaptor
    mapping(address => ICommonKoda) public kodas;

    constructor(IKOAccessControlsLookup _accessControls, ICommonKoda _commonKoda)  {
        accessControls = _accessControls;
        commonKoda = _commonKoda;
    }

    function registerKodaVersion(address _kodaContract, ICommonKoda _deployedFacade) external onlyAdmin {
        kodas[_kodaContract] = _deployedFacade;
    }

    function deregisterKodaVersion(address _kodaContract) external onlyAdmin {
        delete kodas[_kodaContract];
    }

    //////////
    //////////
    //////////

    function getVersion(address _kodaContract) external view returns (uint256 _version) {
        return kodas[_kodaContract].getVersion();
    }

    function editionExists(address _kodaContract, uint256 _editionId) external view returns (bool _exists) {
        return kodas[_kodaContract].editionExists(_editionId);
    }

    function getCreatorOfEdition(address _kodaContract, uint256 _editionId) external view returns (address _originalCreator) {
        return kodas[_kodaContract].getCreatorOfEdition(_editionId);
    }

    function getCreatorOfToken(address _kodaContract, uint256 _tokenId) external view returns (address _originalCreator) {
        return kodas[_kodaContract].getCreatorOfToken(_tokenId);
    }

    function getSizeOfEdition(address _kodaContract, uint256 _editionId) external view returns (uint256 _size) {
        return kodas[_kodaContract].getSizeOfEdition(_editionId);
    }

    function getEditionSizeOfToken(address _kodaContract, uint256 _tokenId) external view returns (uint256 _size) {
        return kodas[_kodaContract].getEditionSizeOfToken(_tokenId);
    }

    function getNextAvailablePrimarySaleToken(address _kodaContract, uint256 _editionId) external returns (uint256 _size) {
        return kodas[_kodaContract].getNextAvailablePrimarySaleToken(_editionId);
    }

    function balanceOf(address _kodaContract, address _owner) external view returns (uint256 _balance) {
        return kodas[_kodaContract].balanceOf(_owner);
    }

    function ownerOf(address _kodaContract, uint256 _tokenId) external view returns (address _owner) {
        return kodas[_kodaContract].ownerOf(_tokenId);
    }

    function exists(address _kodaContract, uint256 _tokenId) external view returns (bool _exists) {
        return kodas[_kodaContract].exists(_tokenId);
    }

    function getApproved(address _kodaContract, uint256 _tokenId) external view returns (address _operator) {
        return kodas[_kodaContract].getApproved(_tokenId);
    }

    function isApprovedForAll(address _kodaContract, address _owner, address _operator) external view returns (bool) {
        return kodas[_kodaContract].isApprovedForAll(_owner, _operator);
    }
}


