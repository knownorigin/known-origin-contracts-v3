// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {IERC721ReadOnly} from "../koda-common/IERC721ReadOnly.sol";

/**
* Minimal interface definition for KODA V2 contract calls
*
* https://www.knownorigin.io/
*/
interface IKODAV2 is IERC721ReadOnly {

  function editionExists(uint256 _editionNumber) external view returns (bool);

  function artistCommission(uint256 _editionNumber) external view returns (address _artistAccount, uint256 _artistCommission);

  function editionOfTokenId(uint256 _tokenId) external view returns (uint256 _editionNumber);

  function totalAvailableEdition(uint256 _editionNumber) external view returns (uint256);

  function totalSupplyEdition(uint256 _editionNumber) external view returns (uint256);

  function totalRemaining(uint256 _editionNumber) external view returns (uint256);
}
