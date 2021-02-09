// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

// Based on https://eips.ethereum.org/EIPS/eip-2612 ERC-20 permit style but for erc-721 tokens
// Variant assumes "value" param replaced with "tokenId" due to non-fungible nature

interface ERC2612_NFTPermit {
    function permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

// FIXME - can we use this for cheapness? - https://github.com/0xProject/0x-monorepo/blob/development/contracts/utils/contracts/src/LibEIP712.sol
// TODO move this back to the core contract
abstract contract NFTPermit is ERC2612_NFTPermit {

    // Token name
    string public name = "KnownOriginDigitalAsset";

    // Token symbol
    string public symbol = "KODA";

    // KODA version
    string public version = "3";

    // Permit domain
    bytes32 public DOMAIN_SEPARATOR;

    // keccak256("Permit(address owner,address spender,uint256 tokenId,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH = 0x48d39b37a35214940203bbbd4f383519797769b13d936f387d89430afef27688;

    constructor() {
        // Grab chain ID
        uint256 chainId;
        assembly {chainId := chainid()}

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                address(this)
            ));
    }

    function getChainId() public view returns (uint256) {
        uint256 chainId;
        assembly {chainId := chainid()}
        return chainId;
    }
}
