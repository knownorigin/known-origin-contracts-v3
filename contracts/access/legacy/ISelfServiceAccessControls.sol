// SPDX-License-Identifier: MIT
pragma solidity 0.8.5;

interface ISelfServiceAccessControls {

    function isEnabledForAccount(address account) external view returns (bool);

}
