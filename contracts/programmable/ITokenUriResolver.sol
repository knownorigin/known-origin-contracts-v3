// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;


interface ITokenUriResolver {

    // TODO do we need a token URI and edition URI resolve?
    //    function tokenURI(uint256 _editionId) external view returns (string memory);

    function editionURI(uint256 _editionId) external view returns (string memory);

    function isDefined(uint256 _editionId) external view returns (bool);
}
