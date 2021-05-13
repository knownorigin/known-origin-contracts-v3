// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

/// @notice Core logic and state shared between both marketplaces
abstract contract BaseMarketplace is ReentrancyGuard, Pausable {
    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);
    event AdminUpdateAccessControls(IKOAccessControlsLookup indexed _oldAddress, IKOAccessControlsLookup indexed _newAddress);
    event AdminUpdatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission);
    event AdminUpdateBidLockupPeriod(uint256 _bidLockupPeriod);
    event AdminUpdatePlatformAccount(address indexed _oldAddress, address indexed _newAddress);

    // Only a whitelisted smart contract in the access controls contract
    modifier onlyContract() {
        require(accessControls.hasContractRole(_msgSender()), "Caller not contract");
        _;
    }

    // Only a whitelisted smart contract or edition creator
    modifier onlyContractOrCreator(uint256 _editionId) {
        require(
            accessControls.hasContractRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or contract"
        );
        _;
    }

    // Only admin defined in the access controls contract
    modifier onlyAdmin() {
        require(accessControls.hasAdminRole(_msgSender()), "Caller not admin");
        _;
    }

    /// @notice Address of the access control contract
    IKOAccessControlsLookup public accessControls;

    /// @notice KODA V3 token
    IKODAV3 public koda;

    /// @notice platform funds collector
    address public platformAccount;

    /// @notice precision 100.00000%
    uint256 public modulo = 100_00000;

    /// @notice Minimum bid / minimum list amount
    uint256 public minBidAmount = 0.01 ether;

    /// @notice Bid lockup period
    uint256 public bidLockupPeriod = 6 hours;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount) {
        koda = _koda;
        accessControls = _accessControls;
        platformAccount = _platformAccount;
    }

    // FIXME admin functions for fixing issues/draining tokens & ETH
    function recoverERC20(IERC20 _token, address _recipient, uint256 _amount) public onlyAdmin {
        _token.transfer(_recipient, _amount);
    }

    function updateAccessControls(IKOAccessControlsLookup _accessControls) public onlyAdmin {
        emit AdminUpdateAccessControls(accessControls, _accessControls);
        accessControls = _accessControls;
    }

    function updateModulo(uint256 _modulo) public onlyAdmin {
        modulo = _modulo;
        emit AdminUpdateModulo(_modulo);
    }

    function updateMinBidAmount(uint256 _minBidAmount) public onlyAdmin {
        minBidAmount = _minBidAmount;
        emit AdminUpdateMinBidAmount(_minBidAmount);
    }

    function updateBidLockupPeriod(uint256 _bidLockupPeriod) public onlyAdmin {
        bidLockupPeriod = _bidLockupPeriod;
        emit AdminUpdateBidLockupPeriod(_bidLockupPeriod);
    }

    function updatePlatformAccount(address _newPlatformAccount) public onlyAdmin {
        emit AdminUpdatePlatformAccount(platformAccount, _newPlatformAccount);
        platformAccount = _newPlatformAccount;
    }

    function pause() public onlyAdmin {
        super._pause();
    }

    function unpause() public onlyAdmin {
        super._unpause();
    }

    function _refundBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "ETH refund failed");
    }

    function _processSale(
        uint256 _id,
        uint256 _paymentAmount,
        address _buyer,
        address _seller,
        bool _reverse
    ) internal virtual returns (uint256);
}
