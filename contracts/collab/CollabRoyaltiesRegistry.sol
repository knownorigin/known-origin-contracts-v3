// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {ERC165Storage} from "@openzeppelin/contracts/utils/introspection/ERC165Storage.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IKODAV3} from "../core/IKODAV3.sol";
import {Konstants} from "../core/Konstants.sol";
import {IERC2981} from "../core/IERC2981.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {ICollabFundsHandler} from "./handlers/ICollabFundsHandler.sol";

contract CollabRoyaltiesRegistry is Pausable, Konstants, ERC165Storage, IERC2981 {

    // Events
    event KODASet(address koda);
    event AccessControlsSet(address accessControls);
    event RoyaltyAmountSet(uint256 royaltyAmount);
    event EmergencyClearRoyalty(uint256 indexed editionId);
    event HandlerAdded(address indexed handler);
    event RoyaltySetup(uint256 indexed editionId, address indexed handler, address indexed proxy, address[] recipients, uint256[] splits);
    event RoyaltySetupReused(uint256 indexed editionId, address indexed handler);

    IKODAV3 public koda;
    IKOAccessControlsLookup public accessControls;

    // @notice A controlled list of proxies which can be used byt eh KO protocol
    mapping(address => bool) public isHandlerWhitelisted;

    /// @notice Funds handler to edition ID mapping - once set all funds are sent here on every sale, including EIP-2981 invocations
    mapping(uint256 => address) public proxies;

    /// @notice KO secondary sale royalty amount
    uint256 public royaltyAmount = 12_50000; // 12.5% as represented in eip-2981

    /// @notice precision 100.00000%
    uint256 public modulo = 100_00000;

    modifier onlyContractOrCreator(uint256 _editionId) {
        require(
            accessControls.hasContractRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or contract"
        );
        _;
    }

    modifier onlyAdmin() {
        require(accessControls.hasAdminRole(_msgSender()), "Caller not admin");
        _;
    }

    constructor(IKOAccessControlsLookup _accessControls) {
        accessControls = _accessControls;

        // _INTERFACE_ID_ERC2981
        _registerInterface(0x2a55205a);
    }

    /// @notice Set the IKODAV3 dependency - can't be passed to constructor due to circular dependency
    function setKoda(IKODAV3 _koda)
    external
    onlyAdmin {
        koda = _koda;
        emit KODASet(address(koda));
    }

    /// @notice Set the IKOAccessControlsLookup dependency.
    function setAccessControls(IKOAccessControlsLookup _accessControls)
    external
    onlyAdmin {
        accessControls = _accessControls;
        emit AccessControlsSet(address(accessControls));
    }

    /// @notice Admin setter for changing the default royalty amount
    function setRoyaltyAmount(uint256 _amount)
    external
    onlyAdmin() {
        require(_amount > 1, "Amount to low");
        royaltyAmount = _amount;
        emit RoyaltyAmountSet(royaltyAmount);
    }

    ////////////////////////////
    /// Royalties setup logic //
    ////////////////////////////

    /// @notice Add a new cloneable funds handler
    function addHandler(address _handler)
    external
    onlyAdmin() {

        // Revert if handler exists with given name
        require(isHandlerWhitelisted[_handler] == false, "Handler name already registered");

        // Store the beacon address by name
        isHandlerWhitelisted[_handler] = true;

        // Emit event
        emit HandlerAdded(_handler);
    }

    /// @notice Reuse the funds handler proxy from a previous collaboration
    function reuseRoyaltySetup(uint256 _editionId, uint256 _previousEditionId)
    external
    whenNotPaused
    onlyContractOrCreator(_editionId)
    returns (address proxy) {
        // Get the proxy registered to the previous edition id
        proxy = proxies[_previousEditionId];

        // Ensure there actually was a registration
        require(proxy != address(0), "No funds handler registered for previous edition id");

        // Register the same proxy for the new edition id
        proxies[_editionId] = proxy;

        // Emit event
        emit RoyaltySetupReused(_editionId, proxy);
    }

    /// @notice Sets up a funds handler proxy
    function setupRoyalty(uint256 _editionId, address _handler, address[] calldata _recipients, uint256[] calldata _splits)
    external
    whenNotPaused
    onlyContractOrCreator(_editionId)
    returns (address proxy) {
        // Disallow multiple setups per edition id
        require(proxies[_editionId] == address(0), "Edition already setup");

        // Require more than 1 recipient
        require(_recipients.length > 1, "Collab must have more than one funds recipient");

        // Recipient and splits array lengths must match
        require(_recipients.length == _splits.length, "Recipients and splits lengths must match");

        require(isHandlerWhitelisted[_handler], "Handler is not whitelisted");

        // Clone funds handler as Minimal Proxy
        bytes32 salt = keccak256(abi.encode(_recipients, _splits));
        proxy = Clones.cloneDeterministic(_handler, salt);

        // Initialize proxy
        ICollabFundsHandler(proxy).init(_recipients, _splits);

        // Verify that it was initialized properly
        require(ICollabFundsHandler(proxy).totalRecipients() == _recipients.length);

        // Store address of proxy by edition id
        proxies[_editionId] = proxy;

        // Emit event
        emit RoyaltySetup(_editionId, _handler, proxy, _recipients, _splits);
    }

    /// @notice Allows for the royalty creator to predetermine the recipient address for the funds to be sent to
    /// @dev It does not deploy it, only allows to predetermine the address
    function predictedRoyaltiesHandler(address _handler, address[] calldata _recipients, uint256[] calldata _splits) public view returns (address) {
        bytes32 salt = keccak256(abi.encode(_recipients, _splits));
        return Clones.predictDeterministicAddress(_handler, salt);
    }

    // TODO method admin to set address
    // TODO method admin to deploy
    // TODO add method for setting address before the funds are there

    /// @notice ability to clear royalty in an emergency situation - this would then default all royalties to the original creator
    /// @dev Only callable from admin
    function emergencyClearRoyaltyHandler(uint256 _editionId) public onlyAdmin {
        proxies[_editionId] = address(0);
        emit EmergencyClearRoyalty(_editionId);
    }

    ////////////////////
    /// Query Methods //
    ////////////////////

    /// @notice Is the given token part of an edition that has a collab royalties contract setup?
    function hasRoyalties(uint256 _tokenId)
    external
    override
    view returns (bool) {

        // Get the associated edition id for the given token id
        uint256 editionId = _editionFromTokenId(_tokenId);

        // Get the proxy registered to the previous edition id
        address proxy = proxies[editionId];

        // Ensure there actually was a registration
        return proxy != address(0);
    }

    /// @notice Get the proxy for a given edition's funds handler
    function getRoyaltiesReceiver(uint256 _editionId)
    external
    override
    view returns (address _receiver) {
        _receiver = proxies[_editionId];
        require(_receiver != address(0), "Edition not setup");
    }

    /// @notice Gets the funds handler proxy address and royalty amount for given edition id
    function royaltyInfo(uint256 _editionId, uint256 _value)
    external
    override
    view returns (address _receiver, uint256 _royaltyAmount) {
        _receiver = proxies[_editionId];
        require(_receiver != address(0), "Edition not setup");
        _royaltyAmount = (_value / modulo) * royaltyAmount;
    }

}
