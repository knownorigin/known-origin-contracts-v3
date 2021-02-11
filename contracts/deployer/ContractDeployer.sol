// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "../core/KnownOriginDigitalAssetV3.sol";
import "../access/IKOAccessControlsLookup.sol";

contract ContractDeployer {
    function deploy(bytes memory code, bytes32 salt) public returns (address addr) {
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {revert(0, 0)}
        }
    }

    function getKODACreationBytecode(
        address _accessControls,
        address _royaltiesRegistryProxy,
        uint256 _editionPointer
    ) public pure returns (bytes memory) {
        bytes memory bytecode = type(KnownOriginDigitalAssetV3).creationCode;

        return abi.encodePacked(bytecode, abi.encode(_accessControls, _royaltiesRegistryProxy, _editionPointer));
    }
}
