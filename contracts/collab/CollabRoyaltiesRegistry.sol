// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IKODAV3} from "../core/IKODAV3.sol";
import {Konstants} from "../core/Konstants.sol";
import {IERC2981HasRoyaltiesExtension} from "../core/IERC2981.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {ICollabFundsHandler} from "./handlers/ICollabFundsHandler.sol";

contract CollabRoyaltiesRegistry is Pausable, Konstants, IERC2981HasRoyaltiesExtension {

    IKODAV3 public koda;
    IKOAccessControlsLookup public accessControls;
    mapping(string => address) public handlers;
    mapping(uint256 => address) public proxies;
    uint256 public proxyCount = 0;
    uint256 public handlerCount = 0;
    uint256 public royaltyAmount = 12_50000; // 12.5% as represented in eip-2981

    // Events
    event KODASet(address koda);
    event AccessControlsSet(address accessControls);
    event RoyaltyAmountSet(uint256 royaltyAmount);
    event HandlerAdded(string name, address handler);
    event RoyaltySetup(uint256 indexed editionId, string handlerName, address handler, address[] recipients, uint256[] splits);
    event RoyaltySetupReused(uint256 indexed editionId, address indexed handler);

    // Modifiers
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

    // Constructor
    constructor(IKOAccessControlsLookup _accessControls) {
        accessControls = _accessControls;
    }

    // Set the IKODAV3 dependency.
    // Can't be passed to constructor, circular since KODA requires this on its constructor
    function setKoda(IKODAV3 _koda)
    external
    onlyAdmin {
        koda = _koda;
        emit KODASet(address(koda));
    }

    // Set the IKOAccessControlsLookup dependency.
    function setAccessControls(IKOAccessControlsLookup _accessControls)
    external
    onlyAdmin {
        accessControls = _accessControls;
        emit AccessControlsSet(address(accessControls));
    }

    // Admin setter for changing the royalty amount
    function setRoyaltyAmount(uint256 _amount)
    external
    onlyAdmin() {
        require(_amount > 1, "Amount to low");
        royaltyAmount = _amount;
        emit RoyaltyAmountSet(royaltyAmount);
    }

    // Is the given token part of an edition that has a collab royalties contract setup?
    function hasRoyalties(uint256 _tokenId)
    external
    override
    view
    returns (bool) {

        // Get the associated edition id for the given token id
        uint256 editionId = _editionFromTokenId(_tokenId);

        // Get the proxy registered to the previous edition id
        address proxy = proxies[editionId];

        // Ensure there actually was a registration
        return proxy != address(0);

    }

    // Add a named funds handler
    function addHandler(string memory _name, address _handler)
    external
    onlyAdmin() {

        // Revert if handler exists with given name
        require(handlers[_name] == address(0), "Handler name already registered");

        // Store the beacon address by name
        handlers[_name] = _handler;

        // Increment handler count
        handlerCount++;

        // Emit event
        emit HandlerAdded(_name, _handler);
    }

    // Reuse the funds handler proxy from a previous collaboration
    function reuseRoyaltySetup(uint256 _editionId, uint256 _previousEditionId)
    external
    payable
    whenNotPaused
    onlyContractOrCreator(_editionId)
    onlyContractOrCreator(_previousEditionId)
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

    // Sets up a funds handler proxy
    function setupRoyalty(uint256 _editionId, string memory _handlerName, address[] calldata _recipients, uint256[] calldata _splits)
    external
    payable
    whenNotPaused
    onlyContractOrCreator(_editionId)
    returns (address proxy) {

        // Disallow multiple setups per edition id
        require(proxies[_editionId] == address(0), "Edition already setup");

        // Require more than 1 recipient
        require(_recipients.length > 1, "Collab must have more than one funds recipient");

        // Recipient and splits array lengths must match
        require(_recipients.length == _splits.length, "Recipients and splits lengths must match");

        // Ensure each collaborator is not a contract
        for (uint256 i = 0; i < _recipients.length; i++) {
            require(!Address.isContract(_recipients[i]), "Recipients may not be contracts");
        }

        // Get the specified funds handler
        address handler = handlers[_handlerName];

        // Clone funds handler as Minimal Proxy
        proxy = Clones.clone(handler);

        // Initialize proxy
        ICollabFundsHandler(proxy).init(_recipients, _splits);

        // Verify that it was initialized properly
        require(ICollabFundsHandler(proxy).totalRecipients() == _recipients.length);

        // Store address of proxy by edition id
        proxies[_editionId] = proxy;

        // Increment proxy count
        proxyCount++;

        // Emit event
        emit RoyaltySetup(_editionId, _handlerName, proxy, _recipients, _splits);
    }

    // Gets the funds handler proxy address and royalty amount for given edition id
    function royaltyInfo(uint256 _editionId)
    external
    view
    returns (address receiver, uint256 amount) {
        receiver = proxies[_editionId];
        require(receiver != address(0), "Edition not setup");
        amount = royaltyAmount;
    }

    // Get the proxy for a given edition's funds handler
    function getProxy(uint256 _editionId) public view returns (address proxy) {
        proxy = proxies[_editionId];
        require(proxy != address(0), "Edition not setup");
    }

}
