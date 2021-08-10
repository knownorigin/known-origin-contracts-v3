const {BN, constants, expectEvent, expectRevert, makeInterfaceId} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {expect} = require('chai');

const ERC721ReceiverMock = artifacts.require('ERC721ReceiverMock');

const wrapReason = reason => `${reason}`;

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const KOAccessControls = artifacts.require('KOAccessControls');

const INTERFACES = {
  ERC165: [
    'supportsInterface(bytes4)',
  ],
  ERC721: [
    'balanceOf(address)',
    'ownerOf(uint256)',
    'approve(address,uint256)',
    'getApproved(uint256)',
    'setApprovalForAll(address,bool)',
    'isApprovedForAll(address,address)',
    'transferFrom(address,address,uint256)',
    'safeTransferFrom(address,address,uint256)',
    'safeTransferFrom(address,address,uint256,bytes)',
  ],
  ERC721Enumerable: [
    'totalSupply()',
    'tokenOfOwnerByIndex(address,uint256)',
    'tokenByIndex(uint256)',
  ],
  ERC721Metadata: [
    'name()',
    'symbol()',
    'tokenURI(uint256)',
  ],
  ERC1155: [
    'balanceOf(address,uint256)',
    'balanceOfBatch(address[],uint256[])',
    'setApprovalForAll(address,bool)',
    'isApprovedForAll(address,address)',
    'safeTransferFrom(address,address,uint256,uint256,bytes)',
    'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
  ],
  ERC1155Receiver: [
    'onERC1155Received(address,address,uint256,uint256,bytes)',
    'onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)',
  ],
};

const INTERFACE_IDS = {};
const FN_SIGNATURES = {};
for (const k of Object.getOwnPropertyNames(INTERFACES)) {
  INTERFACE_IDS[k] = makeInterfaceId.ERC165(INTERFACES[k]);
  for (const fnName of INTERFACES[k]) {
    // the interface id of a single function is equivalent to its function signature
    FN_SIGNATURES[fnName] = makeInterfaceId.ERC165([fnName]);
  }
}

contract('OpenZeppelin ERC721 spec test', (accounts) => {
  const [owner, minter, contract, approved, anotherApproved, operator, other] = accounts;
  const name = 'KnownOriginDigitalAsset';
  const symbol = 'KODA';
  const STARTING_EDITION = '10000';

  const firstTokenId = new BN('11000');
  const secondTokenId = new BN('12000');
  const nonExistentTokenId = new BN('99999999999');
  const baseURI = 'https://api.com/v1/';

  const RECEIVER_MAGIC_VALUE = '0x150b7a02';

  const Error = ['None', 'RevertWithMessage', 'RevertWithoutMessage']
    .reduce((acc, entry, idx) => Object.assign({[entry]: idx}, acc), {});

  beforeEach(async () => {

    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});
  });

  describe('Contract interface(s)', () => {
    beforeEach(() => {
      this.contractUnderTest = this.mock || this.token || this.holder;
    });

    for (const k of ['ERC165', 'ERC721', 'ERC721Metadata']) {
      const interfaceId = INTERFACE_IDS[k];
      describe(k, () => {
        describe('ERC165\'s supportsInterface(bytes4)', () => {
          it('uses less than 30k gas [skip-on-coverage]', async () => {
            expect(await this.contractUnderTest.supportsInterface.estimateGas(interfaceId)).to.be.lte(30000);
          });

          it('claims support', async () => {
            expect(await this.contractUnderTest.supportsInterface(interfaceId)).to.equal(true);
          });
        });

        for (const fnName of INTERFACES[k]) {
          const fnSig = FN_SIGNATURES[fnName];
          describe(fnName, () => {
            it('has to be implemented', () => {
              expect(this.contractUnderTest.abi.filter(fn => fn.signature === fnSig).length).to.equal(1);
            });
          });
        }
      });
    }
  });

  context('with minted tokens', () => {

    beforeEach(async () => {
      await this.token.mintBatchEdition(1, owner, baseURI, {from: contract});
      await this.token.mintBatchEdition(1, owner, baseURI, {from: contract});
      this.toWhom = other; // default to other for toWhom in context-dependent tests
    });

    describe('balanceOf', () => {
      context('when the given address owns some tokens', () => {
        it('returns the amount of tokens owned by the given address', async () => {
          expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('2');
        });
      });

      context('when the given address does not own any tokens', () => {
        it('returns 0', async () => {
          expect(await this.token.balanceOf(other)).to.be.bignumber.equal('0');
        });
      });

      context('when querying the zero address', () => {
        it('throws', async () => {
          await expectRevert(
            this.token.balanceOf(ZERO_ADDRESS), wrapReason('Invalid owner'),
          );
        });
      });
    });

    describe('ownerOf', () => {
      context('when the given token ID was tracked by this token', () => {
        const tokenId = firstTokenId;

        it('returns the owner of the given token ID', async () => {
          expect(await this.token.ownerOf(tokenId)).to.be.equal(owner);
        });
      });

      context('when the given token ID was not tracked by this token', () => {
        const tokenId = nonExistentTokenId;

        it('reverts', async () => {
          await expectRevert(
            this.token.ownerOf(tokenId), wrapReason('Invalid owner'),
          );
        });
      });
    });

    describe('transfers', () => {
      const tokenId = firstTokenId;
      const data = '0x42';

      let logs = null;

      beforeEach(async () => {
        await this.token.approve(approved, tokenId, {from: owner});
        await this.token.setApprovalForAll(operator, true, {from: owner});
      });

      const transferWasSuccessful = ({owner, tokenId, approved}) => {
        it('transfers the ownership of the given token ID to the given address', async () => {
          expect(await this.token.ownerOf(tokenId)).to.be.equal(this.toWhom);
        });

        it('emits a Transfer event', async () => {
          expectEvent.inLogs(logs, 'Transfer', {from: owner, to: this.toWhom, tokenId: tokenId});
        });

        it('clears the approval for the token ID', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });

        // TODO approval flow confirmation
        it.skip('emits an Approval event', async () => {
          expectEvent.inLogs(logs, 'Approval', {owner, approved: ZERO_ADDRESS, tokenId: tokenId});
        });

        it('adjusts owners balances', async () => {
          expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('1');
        });

        it('adjusts owners tokens by index', async () => {
          if (!this.token.tokenOfOwnerByIndex) return;

          expect(await this.token.tokenOfOwnerByIndex(this.toWhom, 0)).to.be.bignumber.equal(tokenId);

          expect(await this.token.tokenOfOwnerByIndex(owner, 0)).to.be.bignumber.not.equal(tokenId);
        });
      };

      const shouldTransferTokensByUsers = (transferFunction) => {
        context('when called by the owner', () => {
          beforeEach(async () => {
            ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: owner}));
          });
          transferWasSuccessful({owner, tokenId, approved});
        });

        context('when called by the approved individual', () => {
          beforeEach(async () => {
            ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: approved}));
          });
          transferWasSuccessful({owner, tokenId, approved});
        });

        context('when called by the operator', () => {
          beforeEach(async () => {
            ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: operator}));
          });
          transferWasSuccessful({owner, tokenId, approved});
        });

        context('when called by the owner without an approved user', () => {
          beforeEach(async () => {
            await this.token.approve(ZERO_ADDRESS, tokenId, {from: owner});
            ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: operator}));
          });
          transferWasSuccessful({owner, tokenId, approved: null});
        });

        context('when sent to the owner', () => {
          beforeEach(async () => {
            ({logs} = await transferFunction.call(this, owner, owner, tokenId, {from: owner}));
          });

          it('keeps ownership of the token', async () => {
            expect(await this.token.ownerOf(tokenId)).to.be.equal(owner);
          });

          it('clears the approval for the token ID', async () => {
            expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
          });

          it('emits only a transfer event', async () => {
            expectEvent.inLogs(logs, 'Transfer', {
              from: owner,
              to: owner,
              tokenId: tokenId,
            });
          });

          it('keeps the owner balance', async () => {
            expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('2');
          });

          it('keeps same tokens by index', async () => {
            if (!this.token.tokenOfOwnerByIndex) return;
            const tokensListed = await Promise.all(
              [0, 1].map(i => this.token.tokenOfOwnerByIndex(owner, i)),
            );
            expect(tokensListed.map(t => t.toNumber())).to.have.members(
              [firstTokenId.toNumber(), secondTokenId.toNumber()],
            );
          });
        });

        context('when the address of the previous owner is incorrect', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, other, other, tokenId, {from: owner}),
              wrapReason('Owner mismatch'),
            );
          });
        });

        context('when the sender is not authorized for the token id', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, tokenId, {from: other}),
              wrapReason('Invalid spender'),
            );
          });
        });

        context('when the given token ID does not exist', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, nonExistentTokenId, {from: owner}),
              wrapReason('Invalid owner'),
            );
          });
        });

        context('when the address to transfer the token to is the zero address', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, ZERO_ADDRESS, tokenId, {from: owner}),
              wrapReason('ERC721_Invalid to address'),
            );
          });
        });
      };

      describe('via transferFrom', () => {
        shouldTransferTokensByUsers((from, to, tokenId, opts) => {
          return this.token.transferFrom(from, to, tokenId, opts);
        });
      });

      describe('via safeTransferFrom', () => {
        const safeTransferFromWithData = (from, to, tokenId, opts) => {
          return this.token.methods['safeTransferFrom(address,address,uint256,bytes)'](from, to, tokenId, data, opts);
        };

        const safeTransferFromWithoutData = (from, to, tokenId, opts) => {
          return this.token.methods['safeTransferFrom(address,address,uint256)'](from, to, tokenId, opts);
        };

        const shouldTransferSafely = (transferFun, data) => {
          describe('to a user account', () => {
            shouldTransferTokensByUsers(transferFun);
          });

          describe('to a valid receiver contract', () => {
            beforeEach(async () => {
              this.receiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, Error.None);
              this.toWhom = this.receiver.address;
            });

            shouldTransferTokensByUsers(transferFun);

            it('calls onERC721Received', async () => {
              const receipt = await transferFun.call(this, owner, this.receiver.address, tokenId, {from: owner});

              await expectEvent.inTransaction(receipt.tx, ERC721ReceiverMock, 'Received', {
                operator: owner,
                from: owner,
                tokenId: tokenId,
                data: data,
              });
            });

            it('calls onERC721Received from approved', async () => {
              const receipt = await transferFun.call(this, owner, this.receiver.address, tokenId, {from: approved});

              await expectEvent.inTransaction(receipt.tx, ERC721ReceiverMock, 'Received', {
                operator: approved,
                from: owner,
                tokenId: tokenId,
                data: data,
              });
            });

            describe('with an invalid token id', () => {
              it('reverts', async () => {
                await expectRevert(
                  transferFun.call(
                    this,
                    owner,
                    this.receiver.address,
                    nonExistentTokenId,
                    {from: owner},
                  ),
                  wrapReason('Invalid owner'),
                );
              });
            });
          });
        };

        describe('with data', () => {
          shouldTransferSafely(safeTransferFromWithData, data);
        });

        describe('without data', () => {
          shouldTransferSafely(safeTransferFromWithoutData, null);
        });

        describe('to a receiver contract returning unexpected value', () => {
          it('reverts', async () => {
            const invalidReceiver = await ERC721ReceiverMock.new('0x42', Error.None);
            await expectRevert(
              this.token.safeTransferFrom(owner, invalidReceiver.address, tokenId, {from: owner}),
              wrapReason('Invalid selector'),
            );
          });
        });

        describe('to a receiver contract that reverts with message', () => {
          it('reverts', async () => {
            const revertingReceiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, Error.RevertWithMessage);
            await expectRevert(
              this.token.safeTransferFrom(owner, revertingReceiver.address, tokenId, {from: owner}),
              'ERC721ReceiverMock: reverting',
            );
          });
        });

        describe('to a receiver contract that reverts without message', () => {
          it('reverts', async () => {
            const revertingReceiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, Error.RevertWithoutMessage);
            await expectRevert.unspecified(
              this.token.safeTransferFrom(owner, revertingReceiver.address, tokenId, {from: owner})
            );
          });
        });

        describe('to a contract that does not implement the required function', () => {
          it('reverts', async () => {
            const nonReceiver = this.token;
            await expectRevert.unspecified(
              this.token.safeTransferFrom(owner, nonReceiver.address, tokenId, {from: owner})
            );
          });
        });
      });
    });

    describe('approve', () => {
      const tokenId = firstTokenId;

      let logs = null;

      const itClearsApproval = () => {
        it('clears approval for the token', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });
      };

      const itApproves = (address) => {
        it('sets the approval for the target address', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(address);
        });
      };

      const itEmitsApprovalEvent = (address) => {
        it('emits an approval event', async () => {
          expectEvent.inLogs(logs, 'Approval', {
            owner: owner,
            approved: address,
            tokenId: tokenId,
          });
        });
      };

      context('when clearing approval', () => {
        context('when there was no prior approval', () => {
          beforeEach(async () => {
            ({logs} = await this.token.approve(ZERO_ADDRESS, tokenId, {from: owner}));
          });

          itClearsApproval();
          itEmitsApprovalEvent(ZERO_ADDRESS);
        });

        context('when there was a prior approval', () => {
          beforeEach(async () => {
            await this.token.approve(approved, tokenId, {from: owner});
            ({logs} = await this.token.approve(ZERO_ADDRESS, tokenId, {from: owner}));
          });

          itClearsApproval();
          itEmitsApprovalEvent(ZERO_ADDRESS);
        });
      });

      context('when approving a non-zero address', () => {
        context('when there was no prior approval', () => {
          beforeEach(async () => {
            ({logs} = await this.token.approve(approved, tokenId, {from: owner}));
          });

          itApproves(approved);
          itEmitsApprovalEvent(approved);
        });

        context('when there was a prior approval to the same address', () => {
          beforeEach(async () => {
            await this.token.approve(approved, tokenId, {from: owner});
            ({logs} = await this.token.approve(approved, tokenId, {from: owner}));
          });

          itApproves(approved);
          itEmitsApprovalEvent(approved);
        });

        context('when there was a prior approval to a different address', () => {
          beforeEach(async () => {
            await this.token.approve(anotherApproved, tokenId, {from: owner});
            ({logs} = await this.token.approve(anotherApproved, tokenId, {from: owner}));
          });

          itApproves(anotherApproved);
          itEmitsApprovalEvent(anotherApproved);
        });
      });

      context('when the address that receives the approval is the owner', () => {
        it('reverts', async () => {
          await expectRevert(
            this.token.approve(owner, tokenId, {from: owner}),
            'Approved in owner',
          );
        });
      });

      context('when the sender does not own the given token ID', () => {
        it('reverts', async () => {
          await expectRevert(
            this.token.approve(approved, tokenId, {from: other}),
            'Invalid sender'
          );
        });
      });

      context('when the sender is approved for the given token ID', () => {
        it('reverts', async () => {
          await this.token.approve(approved, tokenId, {from: owner});
          await expectRevert(
            this.token.approve(anotherApproved, tokenId, {from: approved}),
            'Invalid sender'
          );
        });
      });

      context('when the sender is an operator', () => {
        beforeEach(async () => {
          await this.token.setApprovalForAll(operator, true, {from: owner});
          ({logs} = await this.token.approve(approved, tokenId, {from: operator}));
        });

        itApproves(approved);
        itEmitsApprovalEvent(approved);
      });

      context('when the given token ID does not exist', () => {
        it('reverts', async () => {
          await expectRevert(this.token.approve(approved, nonExistentTokenId, {from: operator}),
            'Invalid owner');
        });
      });
    });

    describe('setApprovalForAll', () => {
      context('when the operator willing to approve is not the owner', () => {
        context('when there is no operator approval set by the sender', () => {
          it('approves the operator', async () => {
            await this.token.setApprovalForAll(operator, true, {from: owner});

            expect(await this.token.isApprovedForAll(owner, operator)).to.equal(true);
          });

          it('emits an approval event', async () => {
            const {logs} = await this.token.setApprovalForAll(operator, true, {from: owner});

            expectEvent.inLogs(logs, 'ApprovalForAll', {
              owner: owner,
              operator: operator,
              approved: true,
            });
          });
        });

        context('when the operator was set as not approved', () => {
          beforeEach(async () => {
            await this.token.setApprovalForAll(operator, false, {from: owner});
          });

          it('approves the operator', async () => {
            await this.token.setApprovalForAll(operator, true, {from: owner});

            expect(await this.token.isApprovedForAll(owner, operator)).to.equal(true);
          });

          it('emits an approval event', async () => {
            const {logs} = await this.token.setApprovalForAll(operator, true, {from: owner});

            expectEvent.inLogs(logs, 'ApprovalForAll', {
              owner: owner,
              operator: operator,
              approved: true,
            });
          });

          it('can unset the operator approval', async () => {
            await this.token.setApprovalForAll(operator, false, {from: owner});

            expect(await this.token.isApprovedForAll(owner, operator)).to.equal(false);
          });
        });

        context('when the operator was already approved', () => {
          beforeEach(async () => {
            await this.token.setApprovalForAll(operator, true, {from: owner});
          });

          it('keeps the approval to the given address', async () => {
            await this.token.setApprovalForAll(operator, true, {from: owner});

            expect(await this.token.isApprovedForAll(owner, operator)).to.equal(true);
          });

          it('emits an approval event', async () => {
            const {logs} = await this.token.setApprovalForAll(operator, true, {from: owner});

            expectEvent.inLogs(logs, 'ApprovalForAll', {
              owner: owner,
              operator: operator,
              approved: true,
            });
          });
        });
      });

      context('when the operator is the owner', () => {
        // FIXME we no longer revert on this on 0x
        // TODO approval flow confirmation
        it.skip('reverts', async () => {
          await expectRevert(
            this.token.setApprovalForAll(owner, true, {from: owner}),
            'ERC721: approve to caller'
          );
        });
      });
    });

    describe('getApproved', async () => {
      context('when token is not minted', async () => {
        // FIXME we no longer revert on this on 0x
        // TODO approval flow confirmation
        it.skip('reverts', async () => {
          await expectRevert(
            this.token.getApproved(nonExistentTokenId),
            'ERC721: approved query for nonexistent token',
          );
        });
      });

      context('when token has been minted ', async () => {
        it('should return the zero address', async () => {
          expect(await this.token.getApproved(firstTokenId)).to.be.equal(
            ZERO_ADDRESS,
          );
        });

        context('when account has been approved', async () => {
          beforeEach(async () => {
            await this.token.approve(approved, firstTokenId, {from: owner});
          });

          it('returns approved account', async () => {
            expect(await this.token.getApproved(firstTokenId)).to.be.equal(approved);
          });
        });
      });
    });
  });

  describe('_mint(address, uint256)', () => {
    // FIXME we dont need this check as we expect the layer above to protect against these things
    it.skip('reverts with a null destination address', async () => {
      await expectRevert(
        this.token.mintBatchEdition(1, ZERO_ADDRESS, baseURI, {from: contract}), 'ERC721: mint to the zero address',
      );
    });

    context('with minted token', async () => {
      beforeEach(async () => {
        ({logs: this.logs} = await this.token.mintBatchEdition(1, owner, baseURI, {from: contract}));
      });

      it('emits a Transfer event', () => {
        expectEvent.inLogs(this.logs, 'Transfer', {from: ZERO_ADDRESS, to: owner, tokenId: firstTokenId});
      });

      it('creates the token', async () => {
        expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('1');
        expect(await this.token.ownerOf(firstTokenId)).to.equal(owner);
      });

    });
  });

  describe('metadata', () => {
    it('has a name', async () => {
      expect(await this.token.name()).to.be.equal(name);
    });

    it('has a symbol', async () => {
      expect(await this.token.symbol()).to.be.equal(symbol);
    });

    describe('token URI', () => {
      beforeEach(async () => {
        await this.token.mintBatchEdition(1, owner, baseURI, {from: contract});
      });

      it('return empty string by default', async () => {
        expect(await this.token.tokenURI(firstTokenId)).to.be.equal('https://api.com/v1/');
      });

      it('reverts when queried for non existent token id', async () => {
        await expectRevert(
          this.token.tokenURI(nonExistentTokenId),
          'Token does not exist',
        );
      });
    });
  });

  // FIXME confirm we dont want burn .... ?
  describe.skip('_burn', () => {
    it('reverts when burning a non-existent token id', async () => {
      await expectRevert(
        this.token.burn(firstTokenId), 'ERC721: owner query for nonexistent token',
      );
    });

    context('with minted tokens', () => {
      beforeEach(async () => {
        await this.token.mint(owner, firstTokenId);
        await this.token.mint(owner, secondTokenId);
      });

      context('with burnt token', () => {
        beforeEach(async () => {
          ({logs: this.logs} = await this.token.burn(firstTokenId));
        });

        it('emits a Transfer event', () => {
          expectEvent.inLogs(this.logs, 'Transfer', {from: owner, to: ZERO_ADDRESS, tokenId: firstTokenId});
        });

        it('emits an Approval event', () => {
          expectEvent.inLogs(this.logs, 'Approval', {owner, approved: ZERO_ADDRESS, tokenId: firstTokenId});
        });

        it('deletes the token', async () => {
          expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('1');
          await expectRevert(
            this.token.ownerOf(firstTokenId), 'ERC721: owner query for nonexistent token',
          );
        });

        it('reverts when burning a token id that has been deleted', async () => {
          await expectRevert(
            this.token.burn(firstTokenId), 'ERC721: owner query for nonexistent token',
          );
        });
      });
    });
  });

});
