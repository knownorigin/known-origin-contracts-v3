// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

interface ISelfServiceAccessControls {

    function isEnabledForAccount(address account) external view returns (bool);

}
