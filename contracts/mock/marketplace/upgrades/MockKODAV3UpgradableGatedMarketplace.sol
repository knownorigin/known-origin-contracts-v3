// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {KODAV3GatedMerkleMarketplace} from "../../../marketplace/gated/KODAV3GatedMerkleMarketplace.sol";
import {IKOAccessControlsLookup} from "../../../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../../../core/IKODAV3.sol";

contract MockKODAV3UpgradableGatedMarketplace is KODAV3GatedMerkleMarketplace {

    function getGreatestFootballTeam() external pure returns (string memory) {
        return "Hull City";
    }
}
