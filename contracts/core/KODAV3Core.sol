// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/GSN/Context.sol";

import "./Konstants.sol";
import "../access/KOAccessControls.sol";

contract KODAV3Core is Konstants, Context {

    // TODO emit events
    // TODO confirm default decimal precision

    // Secondary sale commission
    uint256 public defaultSecondarySaleRoyalty = 100000; // 10%

    // KO commission
    uint256 public defaultPrimarySaleCommission = 150000;  // 15%

    // precision
    uint256 public modulo = 10000;

    // Minimum bid/list amount
    uint256 public minBidAmount = 0.01 ether;

    KOAccessControls public accessControls;

    constructor(KOAccessControls _accessControls){
        accessControls = _accessControls;
    }

    function updateDefaultSecondaryRoyalty(uint256 _defaultSecondarySaleRoyalty) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        defaultSecondarySaleRoyalty = _defaultSecondarySaleRoyalty;
    }

    function updateDefaultPrimaryCommission(uint256 _defaultPrimarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        defaultPrimarySaleCommission = _defaultPrimarySaleCommission;
    }

    function updateModulo(uint256 _modulo) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        modulo = _modulo;
    }

    function updateMinBidAmount(uint256 _minBidAmount) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        minBidAmount = _minBidAmount;
    }
}
