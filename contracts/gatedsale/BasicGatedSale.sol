// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "hardhat/console.sol";
import "../spikes/collaborators/IFundsDrainable.sol";

contract BasicGatedSale {

    uint256 idCounter;

    struct Sale {
        uint256 id;
        uint256 start;
        uint256 end;
        uint256 mints;
        uint256 mintLimit;
        address[] preList;
    }

    mapping(uint256 => Sale) public sales;

    constructor() {}

    function _getLatestID() private returns (uint256) {
        idCounter = idCounter + 1;
        return idCounter;
    }

    function createSale(uint256 _start, uint256 _end, uint256 _mints, uint256 _mintLimit, address[] memory _addresses) public {
        require(_start > block.timestamp, 'sale start time must be in the future');
        require(_end > _start, 'sale end time must be after the sale start time');
        require(_mints > 0, 'total mints must be greater than 0');
        require(_addresses.length > 0, 'addresses count must be greater than 0');

        if(_mintLimit == 0) _mintLimit = _mints;

        uint256 id = _getLatestID();

        sales[id] = Sale(id, _start, _end, _mints, _mintLimit, _addresses);
    }

    function mintFromSale(uint256 _saleID, uint256 _mintCount) public {
        Sale storage sale = sales[_saleID];

        require(sale.id != 0, 'sale does not exist');
        require(_mintCount > 0 && _mintCount < sale.mintLimit, 'number of mints must be below mint limit');

        sale.mints = sale.mints - _mintCount;

        // TODO trigger some sort of NFT transfer on mint
    }

    // set up sale so each sale has it's own prelist and we can prove who is on it...
    // sale should have a start, end, and number of mints (for starters)

    // function setUpSale

    // function buyFromSale
}
