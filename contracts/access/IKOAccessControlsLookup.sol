// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IKOAccessControlsLookup {
    function hasAdminRole(address _address) external view returns (bool);

    function hasMinterRole(address _address) external view returns (bool);

    function hasContractRole(address _address) external view returns (bool);

    function hasContractOrMinterRole(address _address) external view returns (bool);

    function hasContractOrAdminRole(address _address) external view returns (bool);
}
