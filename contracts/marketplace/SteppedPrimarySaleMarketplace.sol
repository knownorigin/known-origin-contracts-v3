// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/GSN/Context.sol";

import "../core/IKODAV3.sol";
import "../access/KOAccessControls.sol";
import "../utils/Konstants.sol";

// TODO remove me
import "hardhat/console.sol";

// TODO - maybe this whole primary sale logic should be part of the base NFT to make is cheaper ... ?

// TODO signature based method for relayer/GSN option

contract SteppedPrimarySaleMarketplace is Context {
    using SafeMath for uint256;

    event SaleStarted(uint256 indexed editionId, uint256 basePrice, uint256 stepPrice);

    event Purchase(uint256 indexed editionId, uint256 indexed tokenId, address indexed buyer, uint256 price);

    struct Price {
        // TODO combine price and step into a single slot
        uint256 basePrice;
        uint256 stepPrice;
        uint256 currentStep;
    }

    KOAccessControls public accessControls;
    IKODAV3 public koda;

    mapping(uint256 => Price) public pricing;

    constructor(KOAccessControls _accessControls, IKODAV3 _koda) {
        accessControls = _accessControls;
        koda = _koda;
    }

    // TODO allow creator to call this director or always force through a factory?
    //      - maybe expose a method for this option in the future regardless?

    // TODO handle start date?

    // TODO handle zero/free price

    function setupSale(uint256 _editionId, uint256 _basePrice, uint256 _stepPrice) public {
        // TODO enforce who can call this - owner of smart contract
        //        require(
        //            accessControls.hasContractRole(_msgSender()),
        //            "KODA: Caller must have smart contract role"
        //        );
        require(pricing[_editionId].basePrice == 0, "Marketplace: edition already setup");

        pricing[_editionId] = Price(_basePrice, _stepPrice, 0);

        emit SaleStarted(_editionId, _basePrice, _stepPrice);
    }

    // TODO Surge pricing and over payment ... ?

    function makePurchase(uint256 _editionId) public payable {
        Price storage price = pricing[_editionId];

        console.log("basePrice %s | currentStep %s | stepPrice %s", price.basePrice, price.currentStep, price.stepPrice);

        // TODO handle step logic
        // Ensure passed price step logic test
        require(price.basePrice <= msg.value, "Value provided is not enough");

        // mark token as sold
        price.currentStep = price.currentStep + 1;

        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

        // TODO handle fees splitting to KO
        //      - one options is to leave the funds in here to save GAS and allow for withdraw from admin

        // send money to creator via royalty hook
        (bool success,) = receiver.call{value : msg.value}("");
        require(success, "Creator payment failed");

        // TODO could we expose a primarySaleTransfer() which is called via only smart contract role and looks up creator to save GAS?

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _msgSender(), tokenId);

        emit Purchase(_editionId, tokenId, _msgSender(), msg.value);
    }

    function makePurchaseViaSig() public payable {
        // consume signature of creator + amount they set
        // unpack amount defined, confirm ownership and make setupSale
        // primary owner does not need to submit pricing model to chain in this scenario
    }

    function updateSale(uint256 _editionId, uint256 _basePrice, uint256 _stepPrice) public {

    }

    function cancelSale(uint256 _editionId) public {
    }
}
