// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "./IKODAV3.sol";
import {Konstants} from "./Konstants.sol";

abstract contract BaseKoda is Konstants, Context, IKODAV3 {

    bytes4 constant internal ERC721_RECEIVED = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));

    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminEditionReported(uint256 indexed _editionId, bool indexed _reported);
    event AdminArtistAccountReported(address indexed _account, bool indexed _reported);

    modifier onlyContract(){
        require(accessControls.hasContractRole(_msgSender()), "Caller must have contract role");
        _;
    }

    modifier onlyAdmin(){
        require(accessControls.hasAdminRole(_msgSender()), "Caller must have admin role");
        _;
    }

    IKOAccessControlsLookup public accessControls;

    // A onchain reference to editions which have been reported for some infringement purposes to KO
    mapping(uint256 => bool) public reportedEditionIds;

    // A onchain reference to accounts which have been lost/hacked etc
    mapping(address => bool) public reportedArtistAccounts;

    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 12_50000; // 12.5%

    constructor(IKOAccessControlsLookup _accessControls) {
        accessControls = _accessControls;
    }

    function reportEditionId(uint256 _editionId, bool _reported) onlyAdmin public {
        reportedEditionIds[_editionId] = _reported;
        emit AdminEditionReported(_editionId, _reported);
    }

    function reportArtistAccount(address _account, bool _reported) onlyAdmin public {
        reportedArtistAccounts[_account] = _reported;
        emit AdminArtistAccountReported(_account, _reported);
    }

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public onlyAdmin {
        secondarySaleRoyalty = _secondarySaleRoyalty;
        emit AdminUpdateSecondaryRoyalty(_secondarySaleRoyalty);
    }

    /// @dev Allows for the ability to extract stuck ERC20 tokens
    /// @dev Only callable from admin
    function withdrawStuckTokens(address _tokenAddress, uint256 _amount, address _withdrawalAccount) public {
        require(accessControls.hasContractOrAdminRole(_msgSender()), "Caller must have contract or admin role");
        IERC20(_tokenAddress).approve(address(this), _amount);
        IERC20(_tokenAddress).transferFrom(address(this), _withdrawalAccount, _amount);
    }

}
