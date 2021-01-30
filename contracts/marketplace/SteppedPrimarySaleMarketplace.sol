// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/GSN/Context.sol";

import "../core/IKODAV3.sol";
import "../access/KOAccessControls.sol";
import "../utils/Konstants.sol";

// TODO remove me
import "hardhat/console.sol";

contract SteppedPrimarySaleMarketplace is Context {
    using SafeMath for uint256;

    struct Price {
        uint256 basePrice;
        uint256 stepPrice;
    }

    KOAccessControls public accessControls;
    IKODAV3 public koda;

    mapping(uint256 => Price) pricing;

    constructor(KOAccessControls _accessControls, IKODAV3 _koda) {
        accessControls = _accessControls;
        koda = _koda;
    }

    // TODO handle zero/free price

    function setupSale(uint256 editionId, uint256 basePrice, uint256 stepPrice) public view {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have smart contract role");
        require(pricing[editionId].basePrice == 0, "Marketplace: edition already setup");

    }

    function updateSale(uint256 editionId, uint256 basePrice, uint256 stepPrice) public view {

    }

    function cancelSale(uint256 editionId) public view {

    }

    function makePurchase(uint256 editionId) public payable {

    }

}
