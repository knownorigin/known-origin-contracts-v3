// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/GSN/Context.sol";

import "../../core/IKODAV3.sol";
import "../../access/KOAccessControls.sol";
import "../../utils/Konstants.sol";

// TODO remove me
import "hardhat/console.sol";

// TODO signature based method for relayer/GSN option

contract BuyNowPrimarySaleMarketplace is Context {
    using SafeMath for uint256;

    KOAccessControls public accessControls;
    IKODAV3 public koda;
    address payable public koCommissionAccount;

    // Default KO commission of 15%
    uint256 public KO_COMMISSION_FEE = 1500;
    uint256 public modulo = 10000; // TODO increase accuracy

    constructor(KOAccessControls _accessControls, IKODAV3 _koda, address payable _koCommissionAccount) {
        accessControls = _accessControls;
        koda = _koda;
        koCommissionAccount = _koCommissionAccount;
    }

    // TODO
    //  seller signs message with sell price
    //  KO stores it in the DB
    //  buyer wants it - passed value + sell sig + buyer sig = trade execution

}
