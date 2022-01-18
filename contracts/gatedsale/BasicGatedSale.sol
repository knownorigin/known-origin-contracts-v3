// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract BasicGatedSale {

    event SaleCreated(uint256 indexed id);
    event MintFromSale(uint256 saleID, address account, uint256 mintCount);

    uint256 private saleIdCounter;

    struct SalePhase {
        uint256 endTime; // The end time of the sale phase, also the beginning of the next phase if applicable
        uint256 mintLimit; // The mint limit per wallet for the phase
        bytes32 merkleRoot; // The merkle tree root for the phase
        uint256 price; // Price in wei for one mint
    }

    struct Sale {
        uint256 id; // The ID of the sale
        uint256 startTime; // The start time of the sale as a whole
        uint256 currentPhase; // The current phase the sale is in
//        uint256 totalMintLimit; // TODO do we want a total mint limit outside of the phases?
    }

    // Sale id return Sale
    mapping(uint256 => Sale) public sales;
    // Sale id => Phase id returns the SalePhase
    mapping(uint256 => mapping(uint => SalePhase)) private phases;
    // Sale id => Phase id => address returns a total mints
    mapping(uint256 => mapping(uint256 => mapping(address => uint))) private totalMints;

    // _nextSaleID generates the next available SaleID
    function _nextSaleId() private returns (uint256) {
        saleIdCounter = saleIdCounter + 1;
        return saleIdCounter;
    }

    function createSale(uint256 _start, SalePhase[] phases) public {
        require(_start > block.timestamp, 'sale start time must be in the future');
        require(phases.length > 0, 'at least one sale phase must be provided');

        // Get the latest sale ID
        uint256 saleId = _nextSaleId();

        // Assign the sale to the sales mapping
        // currentPhase starts at 0 and works upwards
        sales[saleId] = Sale({id:saleId, start: _start, currentPhase: 0});

        // Loop over the sales phases, validate them and assign them to the phases mapping
        for(uint i = 0; i < phases.length; i++) {
            validateSalesPhase(saleID, i, phases[i]);
        }

        emit SaleCreated(saleId); // TODO do we want information about the phases in this event?
    }

    // validateSalesPhase checks each sales phase for requires and then assigns it
    function validateSalesPhase(uint256 _saleId, uint _index, SalePhase _phase) private {
        require(_phase.endTime > block.timestamp, 'sale phase end time must be in the future'); // TODO do we need to pass the previous phases end time and make sure its after?
        require(_phase.mintLimit > 0, 'a mint limit must be provided for the sale phase');
        require(_phase.price > 0, 'a price must be provided for the sale phase');
        require(_phase.merkleRoot != 0, 'a merkle root must be provided for the sale phase');

        // Assign the sales phase to the phases mapping
        phases[_saleId][_index] = _phase;
    }

    function mintFromSale(uint256 _saleId, uint _salePhaseId, uint256 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) public {
//        require(onPreList(_saleId, _salePhaseId, _index, msg.sender, _merkleProof), 'address not able to mint from sale');

        // Get the sale object
        Sale memory sale = sales[_saleId];

        require(block.timestamp >= sale.start, 'sale has not started yet');

        // Check if the current phase is still ongoing
        _salePhaseId = checkSalePhaseEnd(_saleId, _salePhaseId);

        // Check if the address can mint in this phase
        require(onPreList(_saleId, _salePhaseId, _index, msg.sender, _merkleProof), 'address not able to mint from sale');

        SalePhase memory phase = sales[_saleId][_salePhaseId];

        // TODO is there a better way to do this? When should totalMints be assigned etc
        require(totalMints[_saleId][_salePhaseId][msg.sender] + _mintCount > phase.mintLimit, 'cannot exceed total mints for sale phase');

        // TODO get NFT and transfer to msg.sender

        emit MintFromSale(_saleId, msg.sender, _mintCount);
    }

    // checkSalePhaseEnd checks if the current sales phase is still ongoing
    function checkSalePhaseEnd(uint256 _saleId, uint _salePhaseId) private returns(uint) {
        // TODO do we need some checks here on saleID and phaseID to make sure it is valid?
        SalePhase memory phase = sales[_saleId][_salePhaseId];

        // if time has progressed beyond the end of the sales phase then try and up the phase
        if(block.timestamp >= phase.endTime) {
            Sale memory sale = sales[_saleId];
            sale.currentPhase++;
            return _salePhaseId++;
        } else {
            return _salePhaseId;
        }
    }

    function onPreList(uint256 _saleId, uint _salePhaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        SalePhase memory phase = sales[_saleID][_salePhaseId];

        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
    }
}
