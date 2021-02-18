// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/GSN/Context.sol";

import "./Konstants.sol";
import "../access/IKOAccessControlsLookup.sol";

contract KODAV3Core is Konstants, Context {

    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminUpdatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission);
    event AdminUpdateSecondarySaleCommission(uint256 _platformSecondarySaleCommission);
    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);

    // TODO confirm default decimal precision

    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 100000; // 10%

    // KO commission
    uint256 public platformPrimarySaleCommission = 1500000;  // 15.00000%
    uint256 public platformSecondarySaleCommission = 250000;  // 2.50000%

    // precision 100.00000%
    uint256 public modulo = 10000000;

    // Minimum bid/list amount
    uint256 public minBidAmount = 0.01 ether;

    IKOAccessControlsLookup public accessControls;

    constructor(IKOAccessControlsLookup _accessControls){
        accessControls = _accessControls;
    }

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        secondarySaleRoyalty = _secondarySaleRoyalty;
        emit AdminUpdateSecondaryRoyalty(_secondarySaleRoyalty);
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission);
    }

    function updatePlatformSecondarySaleCommission(uint256 _platformSecondarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        platformSecondarySaleCommission = _platformSecondarySaleCommission;
        emit AdminUpdateSecondarySaleCommission(_platformSecondarySaleCommission);
    }

    function updateModulo(uint256 _modulo) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        modulo = _modulo;
        emit AdminUpdateModulo(_modulo);
    }

    function updateMinBidAmount(uint256 _minBidAmount) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        minBidAmount = _minBidAmount;
        emit AdminUpdateMinBidAmount(_minBidAmount);
    }
}
