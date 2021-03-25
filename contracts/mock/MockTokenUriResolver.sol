// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import "../programmable/ITokenUriResolver.sol";

// N:B: Mock contract for testing purposes only
contract MockTokenUriResolver is ITokenUriResolver {

    mapping(uint256 => string) overrides;

    function editionURI(uint256 _editionId) external override view returns (string memory) {
        return overrides[_editionId];
    }

    function isDefined(uint256 _editionId) external override view returns (bool){
        return bytes(overrides[_editionId]).length > 0;
    }

    function setEditionUri(uint256 _editionId, string memory _uri) public {
        overrides[_editionId] = _uri;
    }
}
