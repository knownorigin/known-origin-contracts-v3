// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseUpgradableMarketplace} from "../BaseUpgradableMarketplace.sol";
import {IKOAccessControlsLookup} from "../../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../../core/IKODAV3.sol";

/// @notice Core logic and state shared between both marketplaces
abstract contract BaseGatedMarketplace is BaseUpgradableMarketplace {

    modifier onlyCreatorOrAdmin(uint256 _editionId) {
        require(
            koda.getCreatorOfEdition(_editionId) == _msgSender() || accessControls.hasAdminRole(_msgSender()),
            "Caller not creator or admin"
        );
        _;
    }

    modifier onlyCreatorOrAdminForSale(uint256 _saleId) {
        require(
            koda.getCreatorOfEdition(editionToSale[_saleId]) == _msgSender() || accessControls.hasAdminRole(_msgSender()),
            "Caller not creator or admin of sale"
        );
        _;
    }

    /// @notice emitted when gated sale commission is updated for a given sale
    event AdminUpdateGatedSaleCommission(uint256 indexed saleId, uint256 platformPrimarySaleCommission);

    /// @dev incremental counter for the ID of a sale
    uint256 public saleIdCounter;

    /// @dev totalMints is a mapping of hash(sale id, phase id, address) => total minted by that address
    mapping(bytes32 => uint256) public totalMints;

    /// @dev edition to sale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;

    /// @dev saleCommission is a mapping of sale id => commission %, if 0 its default 15_00000 (15%) unless commission for platform disabled
    mapping(uint256 => uint256) public saleCommission;

    /// @notice When platform wants to take no cut from sale enable this
    mapping(uint256 => bool) public isSaleCommissionForPlatformDisabled;

    function updatePlatformPrimarySaleCommission(uint256 _saleId, uint256 _platformPrimarySaleCommission) external onlyAdmin {
        require(_platformPrimarySaleCommission > 0, "Zero commission must use other admin method");
        require(!isSaleCommissionForPlatformDisabled[_saleId], "Sale commission for platform disabled");
        saleCommission[_saleId] = _platformPrimarySaleCommission;
        emit AdminUpdateGatedSaleCommission(_saleId, getPlatformSaleCommissionForSale(_saleId));
    }

    function togglePlatformCommissionDisabledForSale(uint256 _saleId) external onlyAdmin {
        isSaleCommissionForPlatformDisabled[_saleId] = !isSaleCommissionForPlatformDisabled[_saleId];
        emit AdminUpdateGatedSaleCommission(_saleId, getPlatformSaleCommissionForSale(_saleId));
    }

    function getPlatformSaleCommissionForSale(uint256 _saleId) internal returns (uint256) {
        uint256 commission;
        if (!isSaleCommissionForPlatformDisabled[_saleId]) {
            commission = saleCommission[_saleId] > 0 ? saleCommission[_saleId] : platformPrimaryCommission;
        }
        return commission;
    }

    function getNextAvailablePrimarySaleToken(uint256 _startId, uint256 _maxEditionId, address creator) internal view returns (uint256 _tokenId) {
        for (uint256 tokenId = _startId; tokenId < _maxEditionId; tokenId++) {
            if (koda.ownerOf(tokenId) == creator) {
                return tokenId;
            }
        }
        revert("Primary market exhausted");
    }

    function handleEditionSaleFunds(uint256 _saleId, address _fundsReceiver) internal {
        uint256 platformPrimarySaleCommission = getPlatformSaleCommissionForSale(_saleId);
        uint256 koCommission = (msg.value / modulo) * platformPrimarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "commission payment failed");
        }
        (bool success,) = _fundsReceiver.call{value : msg.value - koCommission}("");
        require(success, "payment failed");
    }

}
