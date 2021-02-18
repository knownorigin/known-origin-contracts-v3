// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface ISelfServiceAccessControls {

    function isEnabledForAccount(address account) external view returns (bool);

}
