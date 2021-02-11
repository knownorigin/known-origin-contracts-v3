// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "../core/KnownOriginDigitalAssetV3.sol";
import "../access/IKOAccessControlsLookup.sol";

// see: https://solidity-by-example.org/app/create2/
contract ContractDeployer {

    event Deployed(address addr, uint256 salt);

    // 1. Get bytecode of contract to be deployed
    // NOTE: args are passed to the constructor
    function getKodaV3Bytecode(
        address _accessControls,
        address _royaltiesRegistryProxy,
        uint256 _editionPointer
    ) public pure returns (bytes memory) {
        // get contract byte code
        bytes memory bytecode = type(KnownOriginDigitalAssetV3).creationCode;

        // combine with encoded constructor args
        return abi.encodePacked(bytecode, abi.encode(_accessControls, _royaltiesRegistryProxy, _editionPointer));
    }

    // 2. Compute the address of the contract to be deployed
    // NOTE: _salt is a random number used to create an address
    function getAddress(bytes memory bytecode, uint _salt) public view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                _salt,
                keccak256(bytecode)
            )
        );
        // NOTE: cast last 20 bytes of hash to address
        return address(uint160(uint256(hash)));
    }

    // 3. Deploy the contract
    // NOTE:
    // The address in the log should equal the address computed from above.
    function deploy(bytes memory bytecode, uint _salt) public payable returns (address) {
        address addr;

        /*
        NOTE: How to call create2
        create2(v, p, n, s)
        create new contract with code at memory p to p + n
        and send v wei
        and return the new address
        where new address = first 20 bytes of keccak256(0xff + address(this) + s + keccak256(mem[p…(p+n)))
              s = big-endian 256-bit value
        */
        assembly {
            addr := create2(
            callvalue(), // wei sent with current call
            // Actual code starts after skipping the first 32 bytes
            add(bytecode, 0x20),
            mload(bytecode), // Load the size of code contained in the first 32 bytes
            _salt // Salt from function arguments
            )

            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        emit Deployed(addr, _salt);
        return addr;
    }

}
