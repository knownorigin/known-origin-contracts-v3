// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;

import "@openzeppelin/contracts/GSN/Context.sol";
import "./IEditionRegistry.sol";
import "../../access/KOAccessControls.sol";
import "../../utils/Konstants.sol";

contract EditionRegistry is Context, IEditionRegistry, Konstants {

    event ContractEnabled(address indexed mintingContract);
    event ContractDisabled(address indexed mintingContract);

    KOAccessControls public accessControls;

    uint256 public editionPointer;

    // Edition number to address
    mapping(uint256 => address) public editionToNftContract;

    // Contracts which are allowed to generate new tokens for KO
    mapping(address => bool) public koNftRegistry;

    constructor(KOAccessControls _accessControls, uint256 _startingEditionPointer)
    public {
        accessControls = _accessControls;

        // TODO from KO v3 staring point ... ?
        editionPointer = _startingEditionPointer;
    }

    // FIXME is there a more GAS efficient way of having a shared state?

    function generateNextEditionNumber() external override returns (uint256) {
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
