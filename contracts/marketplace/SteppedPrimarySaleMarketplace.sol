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

    event SaleStarted(uint256 indexed editionId, uint256 basePrice, uint256 stepPrice);

    struct Price {
        // TODO combine price and step into a single slot
        uint256 basePrice;
        uint256 stepPrice;
        uint256 currentStep;
    }

    KOAccessControls public accessControls;
    IKODAV3 public koda;

    mapping(uint256 => Price) pricing;

    constructor(KOAccessControls _accessControls, IKODAV3 _koda) {
        accessControls = _accessControls;
        koda = _koda;
    }

    // TODO allow creator to call this director or always force through a factory?
    //      - maybe expose a method for this option in the future regardless?

    // TODO handle start date?

    // TODO handle zero/free price

    function setupSale(uint256 _editionId, uint256 _basePrice, uint256 _stepPrice) public {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have smart contract role");
        require(pricing[_editionId].basePrice == 0, "Marketplace: edition already setup");

        pricing[_editionId] = Price(_basePrice, _stepPrice, 0);

        emit SaleStarted(_editionId, _basePrice, _stepPrice);
    }

    // TODO Surge pricing and over payment ... ?

    function makePurchase(uint256 _editionId) public payable {
        Price storage price = pricing[_editionId];

        // Ensure passed price step logic test
        require(price.basePrice.mul(price.currentStep) == msg.value, "Value provided is not enough");

        // get next token to sell
        uint256 tokenId = koda.getNextAvailablePrimarySaleToken(_editionId);

        // mark token as sold
        price.currentStep = price.currentStep + 1;

        // TODO handle fees splitting to KO

        // send money to creator via royalty hook
        (address receiver,) = koda.royaltyInfo(tokenId);
        (bool success,) = receiver.call{value : msg.value}("");
        require(success, "Creator payment failed");

        // TODO could we expose a primarySaleTransfer() which is called via only smart contract role and looks up creator to save GAS?

        // get creator
        address creator = koda.getEditionCreator(_editionId);

        // send token to buyer
        koda.safeTransferFrom(creator, _msgSender(), tokenId);

        // TODO emit event
    }

    function updateSale(uint256 _editionId, uint256 _basePrice, uint256 _stepPrice) public {

    }

    function cancelSale(uint256 _editionId) public {
    }
}
