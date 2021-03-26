// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

interface ISelfServiceAccessControls {

    function isEnabledForAccount(address account) external view returns (bool);

}
