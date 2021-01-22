// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/GSN/Context.sol";

// TODO how to handle existing KO access controls and self service access control/frequency controls?

contract KOAccessControls is AccessControl {

  bytes32 public constant CONTRACT_ROLE = keccak256("CONTRACT_ROLE");
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  constructor() public {
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(MINTER_ROLE, _msgSender());
  }

  /////////////
  // Lookups //
  /////////////

  function hasAdminRole(address _address) public view returns (bool) {
    return hasRole(DEFAULT_ADMIN_ROLE, _address);
  }

  function hasMinterRole(address _address) public view returns (bool) {
    return hasRole(MINTER_ROLE, _address);
  }

  function hasContractRole(address _address) public view returns (bool) {
    return hasRole(CONTRACT_ROLE, _address);
  }

  function hasContractOrMinterRole(address _address) public view returns (bool) {
    return hasRole(CONTRACT_ROLE, _address) || hasRole(MINTER_ROLE, _address);
  }

  ///////////////
  // Modifiers //
  ///////////////

  function addAdminRole(address _address) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to grant role");
    _setupRole(DEFAULT_ADMIN_ROLE, _address);
  }

  function removeAdminRole(address _address) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to revoke role");
    revokeRole(DEFAULT_ADMIN_ROLE, _address);
  }

  function addMinterRole(address _address) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to grant role");
    _setupRole(MINTER_ROLE, _address);
  }

  function removeMinterRole(address _address) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to revoke role");
    revokeRole(MINTER_ROLE, _address);
  }

  function addContractRole(address _address) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to grant role");
    _setupRole(CONTRACT_ROLE, _address);
  }

  function removeContractRole(address _address) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "KOAccessControls: sender must be an admin to revoke role");
    revokeRole(CONTRACT_ROLE, _address);
  }

}
