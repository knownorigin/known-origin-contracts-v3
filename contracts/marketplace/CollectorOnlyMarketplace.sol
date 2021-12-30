// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";

import {CommonKodaAdaptor} from "../koda-common/CommonKodaAdaptor.sol";

contract CollectorOnlyMarketplace is Context, Pausable, ReentrancyGuard {

    event CollectorOnlyMarketplaceDeployed();
    event AdminUpdateAccessControls(IKOAccessControlsLookup indexed _oldAddress, IKOAccessControlsLookup indexed _newAddress);
    event AdminRecoverERC20(IERC20 indexed _token, address indexed _recipient, uint256 _amount);
    event AdminRecoverETH(address payable indexed _recipient, uint256 _amount);

    // Only a whitelisted smart contract in the access controls contract
    modifier onlyContract() {
        require(accessControls.hasContractRole(_msgSender()), "Caller not contract");
        _;
    }

    // Only admin defined in the access controls contract
    modifier onlyAdmin() {
        require(accessControls.hasAdminRole(_msgSender()), "Caller not admin");
        _;
    }

    /// @notice Address of the access control contract
    IKOAccessControlsLookup public accessControls;

    /// @notice Common KODA interface
    CommonKodaAdaptor public kodaAdaptor;

    struct Listing {
        uint128 price;
        uint128 startDate;
    }

    mapping(address => mapping(uint256 => Listing)) public collectorEditions;

    constructor(IKOAccessControlsLookup _accessControls, CommonKodaAdaptor _commonKoda) {
        accessControls = _accessControls;
        kodaAdaptor = _commonKoda;
        emit CollectorOnlyMarketplaceDeployed();
    }

    function setupCollectorOnlyEdition(address _kodaContract, uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    whenNotPaused
    nonReentrant {
        require(kodaAdaptor.editionExists(_kodaContract, _editionId), "Invalid edition or address");
        require(kodaAdaptor.getCreatorOfEdition(_kodaContract, _editionId) == _msgSender(), "Invalid edition or address");

        // TODO validation

        collectorEditions[_kodaContract][_editionId] = Listing(_listingPrice, _startDate);
    }

    function claimCollectorOnlyEdition(address _kodaContract, uint256 _ownedTokenId, uint256 _editionId)
    public
    payable
    whenNotPaused
    nonReentrant {
        require(kodaAdaptor.editionExists(_kodaContract, _editionId), "Invalid edition or address");
        require(kodaAdaptor.ownerOf(_kodaContract, _ownedTokenId) == _msgSender(), "Not current token owner");

        // TODO validation

        require(collectorEditions[_kodaContract][_editionId].startDate >= block.timestamp, "not start yet");
        require(msg.value >= collectorEditions[_kodaContract][_editionId].price, "not enough monies");

        // TODO prevent multiple claims per owner ... mark that token as claimed in some form?

        // transfer from owner to collector ... requires approval
        IERC721(_kodaContract).transferFrom(
            kodaAdaptor.getCreatorOfEdition(_kodaContract, _editionId),
            _msgSender(),
            kodaAdaptor.getNextAvailablePrimarySaleToken(_kodaContract, _editionId)
        );
    }


    /////////////
    /////////////
    /////////////
    /////////////

    function recoverERC20(IERC20 _token, address _recipient, uint256 _amount) public onlyAdmin {
        _token.transfer(_recipient, _amount);
        emit AdminRecoverERC20(_token, _recipient, _amount);
    }

    function recoverStuckETH(address payable _recipient, uint256 _amount) public onlyAdmin {
        (bool success,) = _recipient.call{value : _amount}("");
        require(success, "Unable to send recipient ETH");
        emit AdminRecoverETH(_recipient, _amount);
    }

    function updateAccessControls(IKOAccessControlsLookup _accessControls) public onlyAdmin {
        require(_accessControls.hasAdminRole(_msgSender()), "Sender must have admin role in new contract");
        emit AdminUpdateAccessControls(accessControls, _accessControls);
        accessControls = _accessControls;
    }

}
