// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/GSN/Context.sol";

import "./Konstants.sol";
import "../access/KOAccessControls.sol";

contract KODAV3Core is Konstants, Context {

    // TODO emit events
    // TODO confirm default decimal precision

    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 100000; // 10%

    // KO commission
    uint256 public platformPrimarySaleCommission = 150000;  // 15%
    uint256 public platformSecondarySaleCommission = 25000;  // 2.5%

    // precision
    uint256 public modulo = 1000000;

    // Minimum bid/list amount
    uint256 public minBidAmount = 0.01 ether;

    KOAccessControls public accessControls;

    constructor(KOAccessControls _accessControls){
        accessControls = _accessControls;
    }

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        secondarySaleRoyalty = _secondarySaleRoyalty;
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
    }

    function updatePlatformSecondarySaleCommission(uint256 _platformSecondarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        platformSecondarySaleCommission = _platformSecondarySaleCommission;
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
