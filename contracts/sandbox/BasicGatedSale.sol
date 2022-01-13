// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

contract BasicGatedSale {

    mapping(address => bool) public prelist;

    constructor(address[] memory _addresses) {
        require(_addresses.length > 0, 'no empty lists');

        for (uint256 i = 0; i < _addresses.length; i++) {
            prelist[_addresses[i]] = true;
        }
    }

    // set up sale so each sale has it's own prelist and we can prove who is on it...
    // sale should have a start, end, and number of mints (for starters)

    // function setUpSale

    // function buyFromSale
}
