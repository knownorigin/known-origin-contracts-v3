// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract BasicGatedSale {

    uint256 idCounter; // FIXME should this be public or private?

    struct Sale {
        uint256 id;
        uint256 start;
        uint256 end;
        uint256 mints;
        uint256 mintLimit;
    }

    mapping(uint256 => mapping(address => bool)) public preList; //FIXME could argue this could be private and use the getter?
    mapping(uint256 => Sale) public sales;

    // A publicly available root merkle proof
    bytes32 public prelistMerkleRoot;

    constructor(bytes32 _prelistMerkleRoot) {
        prelistMerkleRoot = _prelistMerkleRoot;
    }

    // FIXME next ID?
    function _getLatestID() private returns (uint256) {
        idCounter = idCounter + 1;
        return idCounter;
    }

    function createSale(uint256 _start, uint256 _end, uint256 _mints, uint256 _mintLimit, address[] memory _addresses) public {
        require(_start > block.timestamp, 'sale start time must be in the future');
        require(_end > _start, 'sale end time must be after the sale start time');
        require(_mints > 0, 'total mints must be greater than 0');
        require(_addresses.length > 0, 'addresses count must be greater than 0');

        // If no mint limit is provided then set it to the size of the sale
        if(_mintLimit == 0) _mintLimit = _mints;

        // Get the latest sale ID
        uint256 id = _getLatestID();

        // Create the sale
        sales[id] = Sale(id, _start, _end, _mints, _mintLimit); // FIXME maybe use the way where the vars are specified as you might pass in the wrong order

        // Loop over the addresses and store who is on the pre list
        for(uint i = 0; i < _addresses.length; i++) {
            preList[id][_addresses[i]] = true;
        }

        // FIXME think about adding an event here
    }

    function getMintingStatus(uint256 _saleID, address _mintingAddress) public view returns (bool) {
        return preList[_saleID][_mintingAddress];
    }

    // FIXME use msg.sender instead of passing _mintingAddress
    function mintFromSale(uint256 _saleID, address _mintingAddress, uint256 _mintCount) public {
        // Check if the address is present in the prelist
        // FIXME you can add this check direct in the require
        // FIXME should be require rather than revert
        if(getMintingStatus(_saleID, _mintingAddress) != true) {
            revert('address not able to mint from sale');
        }

        // Get the sale object
        Sale storage sale = sales[_saleID];

        require(sale.mints != 0, 'sale is sold out');
        require(block.timestamp > sale.start, 'sale has not started yet'); // FIXME >= maybe?
        require(block.timestamp < sale.end, 'sale has ended');
        require(_mintCount > 0 && _mintCount <= sale.mintLimit, 'number of mints must be below mint limit');

        // FIXME this is wrong - mints is the amount per person generically so I suspect you may need a new mapping
        sale.mints = sale.mints - _mintCount;

        // TODO trigger some sort of NFT transfer on mint and emit event
    }

    function onPrelist(uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, prelistMerkleRoot, node);
    }
}
