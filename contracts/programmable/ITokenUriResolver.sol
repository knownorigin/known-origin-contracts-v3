// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;


interface ITokenUriResolver {

    function editionURI(uint256 _editionId) external view returns (string memory);

    function isDefined(uint256 _editionId) external view returns (bool);
}
