// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract BasicGatedSale {

    event SaleCreated(uint256 id);
    event MintFromSale(uint256 saleID, address account, uint256 mintCount);

    uint256 private idCounter;

    struct Sale {
        uint256 id;
        uint256 start;
        uint256 end;
        uint256 mintLimit;
        bytes32 merkleRoot;
    }

    mapping(uint256 => Sale) public sales;

    function _nextID() private returns (uint256) {
        idCounter = idCounter + 1;
        return idCounter;
    }

    function createSale(uint256 _start, uint256 _end, uint256 _mintLimit, bytes32 _merkleRoot) public {
        require(_start > block.timestamp, 'sale start time must be in the future');
        require(_end > _start, 'sale end time must be after the sale start time');

        // If no mint limit is provided then set it to 1
        if(_mintLimit == 0) _mintLimit = 1;

        // Get the latest sale ID
        uint256 id = _nextID();

        // Create the sale
        sales[id] = Sale({id:id, start: _start, end: _end, mintLimit: _mintLimit, merkleRoot: _merkleRoot});

        emit SaleCreated(id);
    }

    function mintFromSale(uint256 _saleID, uint256 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) public {
        require(onPrelist(_saleID, _index, msg.sender, _merkleProof), 'address not able to mint from sale');

        // Get the sale object
        Sale storage sale = sales[_saleID];

        require(block.timestamp >= sale.start, 'sale has not started yet');
        require(block.timestamp < sale.end, 'sale has ended');
        require(_mintCount > 0 && _mintCount <= sale.mintLimit, 'number of mints must be below mint limit');

        // TODO get NFT and transfer to msg.sender

        emit MintFromSale(_saleID, msg.sender, _mintCount);
    }

    function onPrelist(uint256 _saleID, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        Sale storage sale = sales[_saleID];

        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, sale.merkleRoot, node);
    }
}
