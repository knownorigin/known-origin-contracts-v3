// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

/// @notice Core logic and state shared between upgradable marketplaces
abstract contract BaseUpgradableMarketplace is ReentrancyGuardUpgradeable, PausableUpgradeable, UUPSUpgradeable {

    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdatePlatformPrimaryCommission(uint256 newAmount);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);
    event AdminUpdateAccessControls(IKOAccessControlsLookup indexed _oldAddress, IKOAccessControlsLookup indexed _newAddress);
    event AdminUpdateBidLockupPeriod(uint256 _bidLockupPeriod);
    event AdminUpdatePlatformAccount(address indexed _oldAddress, address indexed _newAddress);
    event AdminRecoverERC20(address indexed _token, address indexed _recipient, uint256 _amount);
    event AdminRecoverETH(address payable indexed _recipient, uint256 _amount);

    event BidderRefunded(uint256 indexed _id, address _bidder, uint256 _bid, address _newBidder, uint256 _newOffer);
    event BidderRefundedFailed(uint256 indexed _id, address _bidder, uint256 _bid, address _newBidder, uint256 _newOffer);

    // KO Commission override definition for a given item
    struct KOCommissionOverride {
        bool active;
        uint256 koCommission;
    }

    // Only admin defined in the access controls contract
    modifier onlyAdmin() {
        require(accessControls.hasAdminRole(_msgSender()), "Caller not admin");
        _;
    }

    modifier onlyCreatorContractOrAdmin(uint256 _editionId) {
        require(
            koda.getCreatorOfEdition(_editionId) == _msgSender() || accessControls.hasContractOrAdminRole(_msgSender()),
            "Caller not creator or admin"
        );
        _;
    }

    /// @notice Address of the access control contract
    IKOAccessControlsLookup public accessControls;

    /// @notice KODA V3 token
    IKODAV3 public koda;

    /// @notice platform funds collector
    address public platformAccount;

    /// @notice precision 100.00000%
    uint256 public modulo;

    /// @notice Minimum bid / minimum list amount
    uint256 public minBidAmount;

    /// @notice Bid lockup period
    uint256 public bidLockupPeriod;

    /// @notice Primary commission percentage
    uint256 public platformPrimaryCommission;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();

        require(address(_accessControls) != address(0), "Unable to set invalid accessControls address");
        require(address(_koda) != address(0), "Unable to set invalid koda address");
        require(_platformAccount != address(0), "Unable to set invalid _platformAccount address");

        accessControls = _accessControls;
        koda = _koda;
        platformAccount = _platformAccount;

        // initial values for adjustable vars
        modulo = 100_00000;
        platformPrimaryCommission = 15_00000;
        minBidAmount = 0.01 ether;
        bidLockupPeriod = 6 hours;
    }

    function _authorizeUpgrade(address newImplementation) internal view override {
        require(accessControls.hasAdminRole(msg.sender), "Only admin can upgrade");
    }

    function recoverERC20(address _token, address _recipient, uint256 _amount) public onlyAdmin {
        require(_recipient != address(0), "Unable to send funds to invalid _recipient address");
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(_token), _recipient, _amount);
        emit AdminRecoverERC20(_token, _recipient, _amount);
    }

    function recoverStuckETH(address payable _recipient, uint256 _amount) public onlyAdmin {
        require(_recipient != address(0), "Unable to send funds to invalid _recipient address");
        (bool success,) = _recipient.call{value : _amount}("");
        require(success, "Unable to send recipient ETH");
        emit AdminRecoverETH(_recipient, _amount);
    }

    function updatePlatformPrimaryCommission(uint256 _newAmount) external onlyAdmin {
        platformPrimaryCommission = _newAmount;
        emit AdminUpdatePlatformPrimaryCommission(_newAmount);
    }

    function updateAccessControls(IKOAccessControlsLookup _accessControls) public onlyAdmin {
        require(_accessControls.hasAdminRole(_msgSender()), "Sender must have admin role in new contract");
        emit AdminUpdateAccessControls(accessControls, _accessControls);
        accessControls = _accessControls;
    }

    function updateModulo(uint256 _modulo) public onlyAdmin {
        require(_modulo > 0, "Modulo point cannot be zero");
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
        require(_newPlatformAccount != address(0), "Unable to set invalid _newPlatformAccount address");
        emit AdminUpdatePlatformAccount(platformAccount, _newPlatformAccount);
        platformAccount = _newPlatformAccount;
    }

    function pause() public onlyAdmin {
        super._pause();
    }

    function unpause() public onlyAdmin {
        super._unpause();
    }

    function _getLockupTime() internal view returns (uint256 lockupUntil) {
        lockupUntil = block.timestamp + bidLockupPeriod;
    }

    function _handleSaleFunds(address _fundsReceiver, uint256 _platformCommission) internal {
        uint256 koCommission = msg.value * _platformCommission / modulo;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "commission payment failed");
        }
        (bool success,) = _fundsReceiver.call{value : msg.value - koCommission}("");
        require(success, "payment failed");
    }

    function _refundBidder(uint256 _id, address _receiver, uint256 _paymentAmount, address _newBidder, uint256 _newOffer) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        if (!success) {
            emit BidderRefundedFailed(_id, _receiver, _paymentAmount, _newBidder, _newOffer);
        } else {
            emit BidderRefunded(_id, _receiver, _paymentAmount, _newBidder, _newOffer);
        }
    }

}
