// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/GSN/Context.sol";

import "../marketplace/SteppedPricePrimarySaleMarketplace.sol";
import "../core/KnownOriginDigitalAssetV3.sol";

contract MinterFactory is Context {

    KOAccessControls public accessControls;

    // TODO extract common marketplace methods to interface
    SteppedPricePrimarySaleMarketplace public marketplace;

    // TODO extract common minting methods to interface
    KnownOriginDigitalAssetV3 public koda;

    // TODO make this GSN relay possible

    constructor(KOAccessControls _accessControls, KnownOriginDigitalAssetV3 _koda, SteppedPricePrimarySaleMarketplace _marketplace) {
        accessControls = _accessControls;
        koda = _koda;
        marketplace = _marketplace;
    }

    function mintToken(string calldata _uri, uint256 basePrice)
    external {
        require(accessControls.hasMinterRole(_msgSender()), "KODA: Caller must have minter role");

        // Make token & edition
        uint256 editionId = koda.mintToken(_msgSender(), _uri);

        // setup price
        marketplace.setupSale(editionId, basePrice, 0);
    }

    function mintBatchEdition(uint256 _editionSize, uint256 basePrice, uint256 stepPrice, string calldata _uri)
    external {
        require(accessControls.hasMinterRole(_msgSender()), "KODA: Caller must have minter role");

        // Make token & edition
        (uint256 editionId,) = koda.mintBatchEdition(_editionSize, _msgSender(), _uri);

        // setup price
        marketplace.setupSale(editionId, basePrice, stepPrice);
    }

    function mintConsecutiveBatchEdition(uint256 _editionSize, uint256 basePrice, uint256 stepPrice, string calldata _uri)
    external {
        require(accessControls.hasMinterRole(_msgSender()), "KODA: Caller must have minter role");

        // Make token & edition
        (uint256 editionId,) = koda.mintConsecutiveBatchEdition(_editionSize, _msgSender(), _uri);

        // setup price
        marketplace.setupSale(editionId, basePrice, stepPrice);
    }
}
