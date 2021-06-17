// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import "@openzeppelin/contracts/utils/Context.sol";
import "./IEditionRegistry.sol";
import "../../access/KOAccessControls.sol";
import "../../core/Konstants.sol";

contract EditionRegistry is IEditionRegistry, Konstants, Context {

    event ContractEnabled(address indexed mintingContract);
    event ContractDisabled(address indexed mintingContract);

    KOAccessControls public accessControls;

    uint256 public editionPointer;

    // Edition number to address
    mapping(uint256 => address) public editionToNftContract;

    // Contracts which are allowed to generate new tokens for KO
    mapping(address => bool) public koNftRegistry;

    constructor(KOAccessControls _accessControls, uint256 _startingEditionPointer) {
        accessControls = _accessControls;

        // TODO kick off from KO v3 staring point ... ?
        editionPointer = _startingEditionPointer;
    }

    // FIXME is there a more GAS efficient way of having a shared state?

    function generateNextEditionNumber() public override returns (uint256) {
        require(koNftRegistry[_msgSender()], "EditionRegistry: Caller not registered");

        uint256 nextNumber = editionPointer += MAX_EDITION_SIZE;

        // store the called and the next edition
        editionToNftContract[nextNumber] = _msgSender();

        return nextNumber;
    }

    function enableNftContract(address _contract) public {
        require(accessControls.hasAdminRole(_msgSender()), "EditionRegistry: Caller must have minter role");
        koNftRegistry[_contract] = true;
        emit ContractEnabled(_contract);
    }

    function disableNftContract(address _contract) public {
        require(accessControls.hasAdminRole(_msgSender()), "EditionRegistry: Caller must have minter role");
        koNftRegistry[_contract] = false;
        emit ContractDisabled(_contract);
    }
}
