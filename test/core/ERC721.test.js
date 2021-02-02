const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');

const {expect} = require('chai');

const {shouldSupportInterfaces} = require('./SupportsInterface.behavior');

const ERC721ReceiverMock = artifacts.require('ERC721ReceiverMock');
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const EditionRegistry = artifacts.require('EditionRegistry');

contract('ERC721', function (accounts) {
  const [owner, minter, contract, approved, anotherApproved, operator, other, publisher, creator] = accounts;

  const STARTING_EDITION = '10000';

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  const RECEIVER_MAGIC_VALUE = '0x150b7a02';

  beforeEach(async () => {
    // setu paccess controls
    this.accessControls = await KOAccessControls.new({from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // setup edition registry
    this.editionRegistry = await EditionRegistry.new(
      this.accessControls.address,
      STARTING_EDITION,
      {from: owner}
    );

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      this.editionRegistry.address,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // enable NFT in the registry contract
    await this.editionRegistry.enableNftContract(this.token.address, {from: owner});
  });

  shouldSupportInterfaces([
    'ERC165',
    'ERC721',
    'ERC721Metadata',
  ]);

  describe('metadata', () => {
    it('has a name', async () => {
      expect(await this.token.name()).to.be.equal("KnownOriginDigitalAsset");
    });

    it('has a symbol', async () => {
      expect(await this.token.symbol()).to.be.equal("KODA");
    });

    describe('mintToken(to, uri) token URI', () => {
      beforeEach(async () => {
        await this.token.mintToken(owner, 'my-token-uri', {from: contract});
      });

      it('it is not empty by default', async () => {
        expect(await this.token.tokenURI(firstEditionTokenId)).to.be.equal('my-token-uri');
      });

      it('reverts when queried for non existent token id', async () => {
        await expectRevert(
          this.token.tokenURI(nonExistentTokenId), 'Token does not exist',
        );
      });
    });

    describe('mintBatchEdition(editionSize, to, uri) token URI', () => {
      beforeEach(async () => {
        await this.token.mintBatchEdition(25, owner, 'my-token-uri', {from: contract});
      });

      it('it is not empty by default', async () => {
        expect(await this.token.tokenURI(firstEditionTokenId)).to.be.equal('my-token-uri');
      });

      it('reverts when queried for non existent token id', async () => {
        await expectRevert(
          this.token.tokenURI(nonExistentTokenId), 'Token does not exist',
        );
      });
    });

    describe('mintConsecutiveBatchEdition(editionSize, to, uri) token URI', () => {
      beforeEach(async () => {
        await this.token.mintConsecutiveBatchEdition(25, owner, 'my-token-uri', {from: contract});
      });

      it('it is not empty by default', async () => {
        expect(await this.token.tokenURI(firstEditionTokenId)).to.be.equal('my-token-uri');
      });

      it('reverts when queried for non existent token id', async () => {
        await expectRevert(
          this.token.tokenURI(nonExistentTokenId), 'Token does not exist',
        );
      });
    });
  });

  describe('mintToken(to, uri)', () => {
    context('with minted token', async () => {
      beforeEach(async () => {
        ({logs: this.logs} = await this.token.mintToken(owner, 'my-token-uri', {from: contract}));
      });

      it('emits a Transfer event', () => {
        expectEvent.inLogs(this.logs, 'Transfer', {from: ZERO_ADDRESS, to: owner, tokenId: firstEditionTokenId});
      });

      it('creates the token', async () => {
        await validateToken({
          tokenId: firstEditionTokenId,
          editionId: '11000',
          owner: owner,
          creator: owner,
          balance: '1',
          size: '1',
          uri: 'my-token-uri'
        })
      });
    });
  });

  describe('mintBatchEdition(size, to, uri)', () => {
    const editionSize = '10';

    context('with minted token', async () => {
      beforeEach(async () => {
        ({logs: this.logs} = await this.token.mintBatchEdition(editionSize, owner, 'my-token-uri', {from: contract}));
      });

      it('emits a Transfer event', () => {
        const start = _.toNumber(firstEditionTokenId);
        const end = start + _.toNumber(editionSize);
        _.range(start, end).forEach((id) => {
          expectEvent.inLogs(this.logs, 'Transfer', {from: ZERO_ADDRESS, to: owner, tokenId: id.toString()});
        });
      });

      it('creates the token', async () => {
        const start = _.toNumber(firstEditionTokenId);
        const end = start + _.toNumber(editionSize);
        for (const id of _.range(start, end)) {
          await validateToken({
            tokenId: id.toString(),
            editionId: '11000',
            owner: owner,
            creator: owner,
            balance: editionSize,
            size: editionSize,
            uri: 'my-token-uri'
          })
        }
      });
    });
  });

  describe('mintConsecutiveBatchEdition(size, to, uri)', () => {
    const editionSize = '10';

    context('with minted token', async () => {
      beforeEach(async () => {
        ({logs: this.logs} = await this.token.mintConsecutiveBatchEdition(editionSize, owner, 'my-token-uri', {from: contract}));
      });

      it('emits a ConsecutiveTransfer event', () => {
        const start = _.toNumber(firstEditionTokenId);
        const end = start + _.toNumber(editionSize);
        expectEvent.inLogs(this.logs, 'ConsecutiveTransfer', {
          fromAddress: ZERO_ADDRESS,
          toAddress: owner,
          fromTokenId: start.toString(),
          toTokenId: end.toString()
        });
      });

      it('creates the token', async () => {
        const start = _.toNumber(firstEditionTokenId);
        const end = start + _.toNumber(editionSize);
        for (const id of _.range(start, end)) {
          await validateToken({
            tokenId: id.toString(),
            editionId: '11000',
            owner: owner,
            creator: owner,
            balance: editionSize,
            size: editionSize,
            uri: 'my-token-uri'
          })
        }
      });
    });
  });

  context('with minted tokens from mintToken(to, uri)', () => {
    beforeEach(async () => {
      // this mints to the protocol where owner is address zero
      await this.token.mintToken(owner, 'my-token-uri', {from: contract});
      await this.token.mintToken(owner, 'my-token-uri', {from: contract});
      await this.token.mintToken(owner, 'my-token-uri', {from: contract});

      // confirm owner and balance
      expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('3');
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);
      expect(await this.token.ownerOf(secondEditionTokenId)).to.be.equal(owner);
      expect(await this.token.ownerOf(thirdEditionTokenId)).to.be.equal(owner);

      this.toWhom = other; // default to other for toWhom in context-dependent tests
    });

    describe('balanceOf', () => {
      context('when the given address owns some tokens', () => {
        it('returns the amount of tokens owned by the given address', async () => {
          await this.token.transferFrom(owner, other, firstEditionTokenId, {from: owner});
          await this.token.transferFrom(owner, other, secondEditionTokenId, {from: owner});

          expect(await this.token.balanceOf(other)).to.be.bignumber.equal('2');
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
            this.token.balanceOf(ZERO_ADDRESS), 'ERC721_ZERO_OWNER',
          );
        });
      });
    });

    describe('ownerOf', () => {
      context('when the given token ID was tracked by this token', () => {

        it('returns address zero when token is owned by platform', async () => {
          expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);
        })

        it('returns the owner of the given token ID', async () => {
          await this.token.transferFrom(owner, other, thirdEditionTokenId, {from: owner});
          expect(await this.token.ownerOf(thirdEditionTokenId)).to.be.equal(other); // platform owns minted before auction
        });
      });
    });

    describe('transfers', () => {
      const tokenId = firstEditionTokenId;
      const data = '0x42';

      let logs = null;

      beforeEach(async () => {
        await this.token.approve(approved, tokenId, {from: owner});
        await this.token.setApprovalForAll(operator, true, {from: owner});
      });

      const transferWasSuccessful = function ({owner, tokenId, approved}) {
        it('transfers the ownership of the given token ID to the given address', async () => {
          expect(await this.token.ownerOf(tokenId)).to.be.equal(this.toWhom);
        });

        it('emits a Transfer event', async () => {
          expectEvent.inLogs(logs, 'Transfer', {from: owner, to: this.toWhom, tokenId: tokenId});
        });

        it('clears the approval for the token ID', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });

        it('adjusts owner and new owner balances', async () => {
          expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('2');
          expect(await this.token.balanceOf(this.toWhom)).to.be.bignumber.equal('1');
        });

        it('adjusts owners tokens by index', async () => {
          if (!this.token.tokenOfOwnerByIndex) return;

          expect(await this.token.tokenOfOwnerByIndex(this.toWhom, 0)).to.be.bignumber.equal(tokenId);

          expect(await this.token.tokenOfOwnerByIndex(owner, 0)).to.be.bignumber.not.equal(tokenId);
        });

        it('token validation check', async () => {
          await validateToken({
            tokenId: tokenId,
            editionId: '11000',
            owner: this.toWhom,
            creator: owner,
            balance: '1',
            size: '1',
            uri: 'my-token-uri'
          })
        });
      };

      const shouldTransferTokensByUsers = function (transferFunction) {

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
            await transferFunction.call(this, owner, other, tokenId, {from: owner});

            expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');

            ({logs} = await transferFunction.call(this, other, other, tokenId, {from: other}));
          });

          it('keeps ownership of the token', async () => {
            expect(await this.token.ownerOf(tokenId)).to.be.equal(other);
          });

          it('clears the approval for the token ID', async () => {
            expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
          });

          it('emits only a transfer event', async () => {
            expectEvent.inLogs(logs, 'Transfer', {
              from: other,
              to: other,
              tokenId: tokenId,
            });
          });

          it('keeps the owner balance', async () => {
            expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');
          });

          it('keeps same tokens by index', async () => {
            if (!this.token.tokenOfOwnerByIndex) return;
            const tokensListed = await Promise.all(
              [0].map(i => this.token.tokenOfOwnerByIndex(other, i)),
            );
            expect(tokensListed.map(t => t.toNumber())).to.have.members(
              [firstEditionTokenId.toNumber()],
            );
          });
        });

        context('when the address of the previous owner is incorrect', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, other, other, tokenId, {from: owner}),
              'ERC721_OWNER_MISMATCH',
            );
          });
        });

        context('when the sender is not authorized for the token id', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, tokenId, {from: other}),
              'ERC721_INVALID_SPENDER',
            );
          });
        });

        context('when the given token ID does not exist', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, nonExistentTokenId, {from: owner}),
              'ERC721_ZERO_OWNER',
            );
          });
        });

        context('when the address to transfer the token to is the zero address', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, ZERO_ADDRESS, tokenId, {from: owner}),
              'ERC721_ZERO_TO_ADDRESS',
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
              this.receiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, false);
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
                  'ERC721_ZERO_OWNER',
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
            const invalidReceiver = await ERC721ReceiverMock.new('0x42', false);
            await expectRevert(
              this.token.safeTransferFrom(owner, invalidReceiver.address, tokenId, {from: owner}),
              'ERC721_INVALID_SELECTOR',
            );
          });
        });

        describe('to a receiver contract that throws', () => {
          it('reverts', async () => {
            const revertingReceiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, true);
            await expectRevert(
              this.token.safeTransferFrom(owner, revertingReceiver.address, tokenId, {from: owner}),
              'ERC721ReceiverMock: reverting',
            );
          });
        });

        describe('to a contract that does not implement the required function', () => {
          it('reverts', async () => {
            const nonReceiver = this.accessControls;
            await expectRevert.unspecified(
              this.token.safeTransferFrom(owner, nonReceiver.address, tokenId, {from: owner})
            );
          });
        });
      });
    });

    describe('approve', () => {
      const tokenId = firstEditionTokenId;

      let logs = null;

      const itClearsApproval = () => {
        it('clears approval for the token', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });
      };

      const itApproves = function (address) {
        it('sets the approval for the target address', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(address);
        });
      };

      const itEmitsApprovalEvent = function (address) {
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

      context('when the sender does not own the given token ID', () => {
        it('reverts', async () => {
          await expectRevert(this.token.approve(approved, tokenId, {from: other}),
            'ERC721_INVALID_SENDER');
        });
      });

      context('when the sender is approved for the given token ID', () => {
        it('reverts', async () => {
          await this.token.approve(approved, tokenId, {from: owner});
          await expectRevert(this.token.approve(anotherApproved, tokenId, {from: approved}),
            'ERC721_INVALID_SENDER');
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
            'ERC721_ZERO_OWNER');
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
    });

    describe('getApproved', async () => {
      context('when token has been minted ', async () => {
        it('should return the zero address', async () => {
          expect(await this.token.getApproved(firstEditionTokenId)).to.be.equal(
            ZERO_ADDRESS,
          );
        });

        context('when account has been approved', async () => {
          beforeEach(async () => {
            await this.token.approve(approved, firstEditionTokenId, {from: owner});
          });

          it('returns approved account', async () => {
            expect(await this.token.getApproved(firstEditionTokenId)).to.be.equal(approved);
          });
        });
      });
    });
  });

  context('with minted tokens from mintBatchEdition(size, to, uri)', () => {
    beforeEach(async () => {
      // this mints to the protocol where owner is address zero
      await this.token.mintBatchEdition(10, owner, 'my-token-uri-1', {from: contract});

      this.token1 = firstEditionTokenId;
      this.token2 = new BN(firstEditionTokenId).add(new BN('1'));
      this.token3 = new BN(firstEditionTokenId).add(new BN('2'));

      // confirm owner and balance
      expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('10');
      expect(await this.token.ownerOf(this.token1)).to.be.equal(owner);
      expect(await this.token.ownerOf(this.token2)).to.be.equal(owner);
      expect(await this.token.ownerOf(this.token3)).to.be.equal(owner);

      this.toWhom = other; // default to other for toWhom in context-dependent tests
    });

    describe('balanceOf', () => {
      context('when the given address owns some tokens', () => {
        it('returns the amount of tokens owned by the given address', async () => {
          await this.token.transferFrom(owner, other, this.token1, {from: owner});
          await this.token.transferFrom(owner, other, this.token2, {from: owner});

          expect(await this.token.balanceOf(other)).to.be.bignumber.equal('2');
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
            this.token.balanceOf(ZERO_ADDRESS), 'ERC721_ZERO_OWNER',
          );
        });
      });
    });

    describe('ownerOf', () => {
      context('when the given token ID was tracked by this token', () => {

        it('returns address zero when token is owned by platform', async () => {
          expect(await this.token.ownerOf(this.token1)).to.be.equal(owner);
        })

        it('returns the owner of the given token ID', async () => {
          await this.token.transferFrom(owner, other, this.token3, {from: owner});
          expect(await this.token.ownerOf(this.token3)).to.be.equal(other); // platform owns minted before auction
        });
      });
    });

    describe('transfers', () => {
      const tokenId = firstEditionTokenId;
      const data = '0x42';

      let logs = null;

      beforeEach(async () => {
        await this.token.approve(approved, tokenId, {from: owner});
        await this.token.setApprovalForAll(operator, true, {from: owner});
      });

      const transferWasSuccessful = function ({owner, tokenId, approved}) {
        it('transfers the ownership of the given token ID to the given address', async () => {
          expect(await this.token.ownerOf(tokenId)).to.be.equal(this.toWhom);
        });

        it('emits a Transfer event', async () => {
          expectEvent.inLogs(logs, 'Transfer', {from: owner, to: this.toWhom, tokenId: tokenId});
        });

        it('clears the approval for the token ID', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });

        it('adjusts owner and new owner balances', async () => {
          expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('9');
          expect(await this.token.balanceOf(this.toWhom)).to.be.bignumber.equal('1');
        });

        it('adjusts owners tokens by index', async () => {
          if (!this.token.tokenOfOwnerByIndex) return;

          expect(await this.token.tokenOfOwnerByIndex(this.toWhom, 0)).to.be.bignumber.equal(tokenId);

          expect(await this.token.tokenOfOwnerByIndex(owner, 0)).to.be.bignumber.not.equal(tokenId);
        });

        it('token validation check', async () => {
          await validateToken({
            tokenId: tokenId,
            editionId: '11000',
            owner: this.toWhom,
            creator: owner,
            balance: '1',
            size: '10',
            uri: 'my-token-uri-1'
          })
        });
      };

      const shouldTransferTokensByUsers = function (transferFunction) {

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
            await transferFunction.call(this, owner, other, tokenId, {from: owner});

            expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');

            ({logs} = await transferFunction.call(this, other, other, tokenId, {from: other}));
          });

          it('keeps ownership of the token', async () => {
            expect(await this.token.ownerOf(tokenId)).to.be.equal(other);
          });

          it('clears the approval for the token ID', async () => {
            expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
          });

          it('emits only a transfer event', async () => {
            expectEvent.inLogs(logs, 'Transfer', {
              from: other,
              to: other,
              tokenId: tokenId,
            });
          });

          it('keeps the owner balance', async () => {
            expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');
          });

          it('keeps same tokens by index', async () => {
            if (!this.token.tokenOfOwnerByIndex) return;
            const tokensListed = await Promise.all(
              [0].map(i => this.token.tokenOfOwnerByIndex(other, i)),
            );
            expect(tokensListed.map(t => t.toNumber())).to.have.members(
              [this.token1.toNumber()],
            );
          });
        });

        context('when the address of the previous owner is incorrect', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, other, other, tokenId, {from: owner}),
              'ERC721_OWNER_MISMATCH',
            );
          });
        });

        context('when the sender is not authorized for the token id', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, tokenId, {from: other}),
              'ERC721_INVALID_SPENDER',
            );
          });
        });

        context('when the given token ID does not exist', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, nonExistentTokenId, {from: owner}),
              'ERC721_ZERO_OWNER',
            );
          });
        });

        context('when the address to transfer the token to is the zero address', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, ZERO_ADDRESS, tokenId, {from: owner}),
              'ERC721_ZERO_TO_ADDRESS',
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
              this.receiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, false);
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
                  'ERC721_ZERO_OWNER',
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
            const invalidReceiver = await ERC721ReceiverMock.new('0x42', false);
            await expectRevert(
              this.token.safeTransferFrom(owner, invalidReceiver.address, tokenId, {from: owner}),
              'ERC721_INVALID_SELECTOR',
            );
          });
        });

        describe('to a receiver contract that throws', () => {
          it('reverts', async () => {
            const revertingReceiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, true);
            await expectRevert(
              this.token.safeTransferFrom(owner, revertingReceiver.address, tokenId, {from: owner}),
              'ERC721ReceiverMock: reverting',
            );
          });
        });

        describe('to a contract that does not implement the required function', () => {
          it('reverts', async () => {
            const nonReceiver = this.accessControls;
            await expectRevert.unspecified(
              this.token.safeTransferFrom(owner, nonReceiver.address, tokenId, {from: owner})
            );
          });
        });
      });
    });

    describe('approve', () => {
      const tokenId = firstEditionTokenId;

      let logs = null;

      const itClearsApproval = () => {
        it('clears approval for the token', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });
      };

      const itApproves = function (address) {
        it('sets the approval for the target address', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(address);
        });
      };

      const itEmitsApprovalEvent = function (address) {
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

      context('when the sender does not own the given token ID', () => {
        it('reverts', async () => {
          await expectRevert(this.token.approve(approved, tokenId, {from: other}),
            'ERC721_INVALID_SENDER');
        });
      });

      context('when the sender is approved for the given token ID', () => {
        it('reverts', async () => {
          await this.token.approve(approved, tokenId, {from: owner});
          await expectRevert(this.token.approve(anotherApproved, tokenId, {from: approved}),
            'ERC721_INVALID_SENDER');
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
            'ERC721_ZERO_OWNER');
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
    });

    describe('getApproved', async () => {
      context('when token has been minted ', async () => {
        it('should return the zero address', async () => {
          expect(await this.token.getApproved(this.token1)).to.be.equal(
            ZERO_ADDRESS,
          );
        });

        context('when account has been approved', async () => {
          beforeEach(async () => {
            await this.token.approve(approved, this.token1, {from: owner});
          });

          it('returns approved account', async () => {
            expect(await this.token.getApproved(this.token1)).to.be.equal(approved);
          });
        });
      });
    });
  });

  context('with minted tokens from mintConsecutiveBatchEdition(size, to, uri)', () => {
    beforeEach(async () => {
      // this mints to the protocol where owner is address zero
      await this.token.mintConsecutiveBatchEdition(10, owner, 'my-token-uri-1', {from: contract});

      this.token1 = firstEditionTokenId;
      this.token2 = new BN(firstEditionTokenId).add(new BN('1'));
      this.token3 = new BN(firstEditionTokenId).add(new BN('2'));

      // confirm owner and balance
      expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('10');
      expect(await this.token.ownerOf(this.token1)).to.be.equal(owner);
      expect(await this.token.ownerOf(this.token2)).to.be.equal(owner);
      expect(await this.token.ownerOf(this.token3)).to.be.equal(owner);

      this.toWhom = other; // default to other for toWhom in context-dependent tests
    });

    describe('balanceOf', () => {
      context('when the given address owns some tokens', () => {
        it('returns the amount of tokens owned by the given address', async () => {
          await this.token.transferFrom(owner, other, this.token1, {from: owner});
          await this.token.transferFrom(owner, other, this.token2, {from: owner});

          expect(await this.token.balanceOf(other)).to.be.bignumber.equal('2');
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
            this.token.balanceOf(ZERO_ADDRESS), 'ERC721_ZERO_OWNER',
          );
        });
      });
    });

    describe('ownerOf', () => {
      context('when the given token ID was tracked by this token', () => {

        it('returns address zero when token is owned by platform', async () => {
          expect(await this.token.ownerOf(this.token1)).to.be.equal(owner);
        })

        it('returns the owner of the given token ID', async () => {
          await this.token.transferFrom(owner, other, this.token3, {from: owner});
          expect(await this.token.ownerOf(this.token3)).to.be.equal(other); // platform owns minted before auction
        });
      });
    });

    describe('transfers', () => {
      const tokenId = firstEditionTokenId;
      const data = '0x42';

      let logs = null;

      beforeEach(async () => {
        await this.token.approve(approved, tokenId, {from: owner});
        await this.token.setApprovalForAll(operator, true, {from: owner});
      });

      const transferWasSuccessful = function ({owner, tokenId, approved}) {
        it('transfers the ownership of the given token ID to the given address', async () => {
          expect(await this.token.ownerOf(tokenId)).to.be.equal(this.toWhom);
        });

        it('emits a Transfer event', async () => {
          expectEvent.inLogs(logs, 'Transfer', {from: owner, to: this.toWhom, tokenId: tokenId});
        });

        it('clears the approval for the token ID', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });

        it('adjusts owner and new owner balances', async () => {
          expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('9');
          expect(await this.token.balanceOf(this.toWhom)).to.be.bignumber.equal('1');
        });

        it('adjusts owners tokens by index', async () => {
          if (!this.token.tokenOfOwnerByIndex) return;

          expect(await this.token.tokenOfOwnerByIndex(this.toWhom, 0)).to.be.bignumber.equal(tokenId);

          expect(await this.token.tokenOfOwnerByIndex(owner, 0)).to.be.bignumber.not.equal(tokenId);
        });

        it('token validation check', async () => {
          await validateToken({
            tokenId: tokenId,
            editionId: '11000',
            owner: this.toWhom,
            creator: owner,
            balance: '1',
            size: '10',
            uri: 'my-token-uri-1'
          })
        });
      };

      const shouldTransferTokensByUsers = function (transferFunction) {

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
            await transferFunction.call(this, owner, other, tokenId, {from: owner});

            expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');

            ({logs} = await transferFunction.call(this, other, other, tokenId, {from: other}));
          });

          it('keeps ownership of the token', async () => {
            expect(await this.token.ownerOf(tokenId)).to.be.equal(other);
          });

          it('clears the approval for the token ID', async () => {
            expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
          });

          it('emits only a transfer event', async () => {
            expectEvent.inLogs(logs, 'Transfer', {
              from: other,
              to: other,
              tokenId: tokenId,
            });
          });

          it('keeps the owner balance', async () => {
            expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');
          });

          it('keeps same tokens by index', async () => {
            if (!this.token.tokenOfOwnerByIndex) return;
            const tokensListed = await Promise.all(
              [0].map(i => this.token.tokenOfOwnerByIndex(other, i)),
            );
            expect(tokensListed.map(t => t.toNumber())).to.have.members(
              [this.token1.toNumber()],
            );
          });
        });

        context('when the address of the previous owner is incorrect', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, other, other, tokenId, {from: owner}),
              'ERC721_OWNER_MISMATCH',
            );
          });
        });

        context('when the sender is not authorized for the token id', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, tokenId, {from: other}),
              'ERC721_INVALID_SPENDER',
            );
          });
        });

        context('when the given token ID does not exist', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, other, nonExistentTokenId, {from: owner}),
              'ERC721_ZERO_OWNER',
            );
          });
        });

        context('when the address to transfer the token to is the zero address', () => {
          it('reverts', async () => {
            await expectRevert(
              transferFunction.call(this, owner, ZERO_ADDRESS, tokenId, {from: owner}),
              'ERC721_ZERO_TO_ADDRESS',
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
              this.receiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, false);
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
                  'ERC721_ZERO_OWNER',
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
            const invalidReceiver = await ERC721ReceiverMock.new('0x42', false);
            await expectRevert(
              this.token.safeTransferFrom(owner, invalidReceiver.address, tokenId, {from: owner}),
              'ERC721_INVALID_SELECTOR',
            );
          });
        });

        describe('to a receiver contract that throws', () => {
          it('reverts', async () => {
            const revertingReceiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, true);
            await expectRevert(
              this.token.safeTransferFrom(owner, revertingReceiver.address, tokenId, {from: owner}),
              'ERC721ReceiverMock: reverting',
            );
          });
        });

        describe('to a contract that does not implement the required function', () => {
          it('reverts', async () => {
            const nonReceiver = this.accessControls;
            await expectRevert.unspecified(
              this.token.safeTransferFrom(owner, nonReceiver.address, tokenId, {from: owner})
            );
          });
        });
      });
    });

    describe('approve', () => {
      const tokenId = firstEditionTokenId;

      let logs = null;

      const itClearsApproval = () => {
        it('clears approval for the token', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
        });
      };

      const itApproves = function (address) {
        it('sets the approval for the target address', async () => {
          expect(await this.token.getApproved(tokenId)).to.be.equal(address);
        });
      };

      const itEmitsApprovalEvent = function (address) {
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

      context('when the sender does not own the given token ID', () => {
        it('reverts', async () => {
          await expectRevert(this.token.approve(approved, tokenId, {from: other}),
            'ERC721_INVALID_SENDER');
        });
      });

      context('when the sender is approved for the given token ID', () => {
        it('reverts', async () => {
          await this.token.approve(approved, tokenId, {from: owner});
          await expectRevert(this.token.approve(anotherApproved, tokenId, {from: approved}),
            'ERC721_INVALID_SENDER');
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
            'ERC721_ZERO_OWNER');
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
    });

    describe('getApproved', async () => {
      context('when token has been minted ', async () => {
        it('should return the zero address', async () => {
          expect(await this.token.getApproved(this.token1)).to.be.equal(
            ZERO_ADDRESS,
          );
        });

        context('when account has been approved', async () => {
          beforeEach(async () => {
            await this.token.approve(approved, this.token1, {from: owner});
          });

          it('returns approved account', async () => {
            expect(await this.token.getApproved(this.token1)).to.be.equal(approved);
          });
        });
      });
    });
  });


  // FIXME - missing require() tests
  // FIXME - missing royaltyInfo test
  // FIXME - isApprovedForAll() test
  // FIXME - isContract() test
  // FIXME - _checkOnERC721Received() test

  const validateToken = async ({tokenId, editionId, owner, creator, balance, size, uri}) => {
    console.log(`Validate token ID [${tokenId}] - edition ID [${editionId}]`);
    expect(await this.token.ownerOf(tokenId)).to.equal(owner, "Failed owner validation");
    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal(balance, "Failed balance validation");

    ////////////////////
    // Edition checks //
    ////////////////////

    const _editionId = await this.token.getEditionIdForToken(tokenId);
    expect(_editionId).to.bignumber.equal(editionId, "Failed Edition ID validation")

    const _creator = await this.token.getEditionCreator(editionId);
    expect(_creator).to.equal(creator, "Failed Edition creator validation")

    const _size = await this.token.getEditionSize(editionId);
    expect(_size).to.bignumber.equal(size, "Failed Edition size validation")

    const exists = await this.token.editionExists(editionId);
    expect(exists).to.equal(true, "Failed Edition exists validation")

    //////////////////
    // Token checks //
    //////////////////

    const _tokenEditionSize = await this.token.getEditionSizeOfToken(tokenId);
    expect(_tokenEditionSize).to.bignumber.equal(size, "Failed Token edition size validation")

    const _uri = await this.token.tokenURI(tokenId);
    expect(_uri).to.equal(uri, "Failed token URI validation")

    const _tokenCreator = await this.token.getEditionCreatorOfToken(tokenId);
    expect(_tokenCreator).to.equal(creator, "Failed token edition creator validation")

    const editionDetails = await this.token.getEditionDetails(tokenId);
    expect(editionDetails._originalCreator).to.equal(creator, "Failed edition details creator validation")
    expect(editionDetails._owner).to.equal(owner, "Failed edition details owner validation")
    expect(editionDetails._editionId).to.bignumber.equal(editionId, "Failed edition details edition validation")
    expect(editionDetails._size).to.bignumber.equal(size, "Failed edition details size validation")
    expect(editionDetails._uri).to.equal(uri, "Failed edition details uri validation")
  }

});
