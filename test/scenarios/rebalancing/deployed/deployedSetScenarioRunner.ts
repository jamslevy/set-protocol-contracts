require('module-alias/register');

import * as _ from 'lodash';
import * as setProtocolUtils from 'set-protocol-utils';
import { Address, Web3Utils } from 'set-protocol-utils';
import { BigNumber } from 'set-protocol-utils';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  BTCETHRebalancingManagerContract,
  CoreContract,
  MedianContract,
  RebalanceAuctionModuleContract,
  RebalancingSetTokenContract,
  RebalancingSetTokenFactoryContract,
  SetTokenFactoryContract,
  StandardTokenMockContract,
  TransferProxyContract,
  VaultContract,
  WhiteListContract,
} from '@utils/contracts';
import { Blockchain } from '@utils/blockchain';
import { getWeb3 } from '@utils/web3Helper';

import {
  AssetScenario,
  NewIssuanceTxn,
} from './types';

import { RebalancingScenarioValidations } from './validations';

import { DEPENDENCY } from '@deployments/deployedContractParameters';

import {
  findDependency,
  getContractAddress,
} from '@deployments/utils/output-helper';

import { CoreWrapper } from '@utils/wrappers/coreWrapper';
import { ERC20Wrapper } from '@utils/wrappers/erc20Wrapper';
import { OracleWrapper } from '@utils/wrappers/oracleWrapper';
import { RebalancingWrapper } from '@utils/wrappers/rebalancingWrapper';

BigNumberSetup.configure();
ChaiSetup.configure();
const web3 = getWeb3();
const blockchain = new Blockchain(web3);
const web3Utils = new Web3Utils(web3);

const LARGE_QUANTITY_COMPONENT = new BigNumber(10 ** 30);

export class RebalanceScenariosWrapper {
  private _accounts: Address[];
  private _rebalanceProgram: AssetScenario;
  private _currentIteration: number;

  private _managerAddress: Address;

  private _contractOwnerAddress: Address;
  private _coreWrapper: CoreWrapper;
  private _erc20Wrapper: ERC20Wrapper;
  private _oracleWrapper: OracleWrapper;
  private _rebalancingWrapper: RebalancingWrapper;
  private _scenarioValidations: RebalancingScenarioValidations;

  private _rebalancingSetToken: RebalancingSetTokenContract;
  private _assetOne: StandardTokenMockContract;
  private _assetTwo: StandardTokenMockContract;

  private _core: CoreContract;
  private _transferProxy: TransferProxyContract;
  private _vault: VaultContract;
  private _rebalanceAuctionModule: RebalanceAuctionModuleContract;
  private _rebalancingComponentWhiteList: WhiteListContract;
  private _rebalancingFactory: RebalancingSetTokenFactoryContract;
  private _btcethRebalancingManager: BTCETHRebalancingManagerContract;
  private _assetOneMedianizer: MedianContract;
  private _assetTwoMedianizer: MedianContract;

  private rebalancingSetAddress: Address;

  constructor(accounts: Address[], rebalanceProgram: AssetScenario) {
    this._contractOwnerAddress = accounts[0];
    this._rebalanceProgram = rebalanceProgram;
    this._accounts = accounts;

    this._coreWrapper = new CoreWrapper(this._contractOwnerAddress, this._contractOwnerAddress);
    this._erc20Wrapper = new ERC20Wrapper(this._contractOwnerAddress);
    this._rebalancingWrapper = new RebalancingWrapper(
      this._contractOwnerAddress,
      this._coreWrapper,
      this._erc20Wrapper,
      blockchain
    );
    this._oracleWrapper = new OracleWrapper(this._contractOwnerAddress);

    this._scenarioValidations = new RebalancingScenarioValidations(accounts, rebalanceProgram);
  }

  public async runFullRebalanceProgram(): Promise<void> {
    await this.initialize();
    await this.runRebalanceScenarios();
  }

  public async initialize(): Promise<void> {
    await this._scenarioValidations.initialize();

    this._core = await this._coreWrapper.getDeployedCoreAsync();
    this._transferProxy = await this._coreWrapper.getDeployedTransferProxyAsync();
    this._vault = await this._coreWrapper.getDeployedVaultAsync();

    const {
      rebalancingSetName,
      collateralSetName,
      assetOne,
      assetTwo,
      assetOneMedianizer,
      assetTwoMedianizer,
      managerName,
      rebalancingSetConfig,
    } = this._rebalanceProgram;

    const assetOneAddress = await findDependency(assetOne);
    const assetTwoAddress = await findDependency(assetTwo);
    const components = await this._erc20Wrapper.retrieveTokenInstancesAsync([assetOneAddress, assetTwoAddress]);
    this._assetOne = components[0];
    this._assetTwo = components[1];

    const rebalancingSetAddress = await getContractAddress(rebalancingSetName);
    this._rebalancingSetToken = await this._rebalancingWrapper.getRebalancingSetInstance(rebalancingSetAddress);

    const assetOneMedianizerAddress = await getContractAddress(DEPENDENCY.WBTC_MEDIANIZER);
    this._assetOneMedianizer = await this._oracleWrapper.getDeployedMedianizerAsync(assetOneMedianizerAddress);
    await this._oracleWrapper.addPriceFeedOwnerToMedianizer(this._assetOneMedianizer, this._contractOwnerAddress);
    // TODO: Add IF statement if mediniazer is empty
    const latestBlock = await web3.eth.getBlock('latest');
    const latestBlockTimestamp = new BigNumber(latestBlock.timestamp);

    await this._oracleWrapper.updateMedianizerPriceAsync(
      this._assetOneMedianizer,
      rebalancingSetConfig.initialAssetOnePrice,
      latestBlockTimestamp,
    );

    const assetTwoMedianizerAddress = await getContractAddress(DEPENDENCY.WETH_MEDIANIZER);
    this._assetTwoMedianizer = await this._oracleWrapper.getDeployedMedianizerAsync(assetTwoMedianizerAddress);
    await this._oracleWrapper.addPriceFeedOwnerToMedianizer(this._assetTwoMedianizer, this._contractOwnerAddress);
    await this._oracleWrapper.updateMedianizerPriceAsync(
      this._assetTwoMedianizer,
      rebalancingSetConfig.initialAssetTwoPrice,
      latestBlockTimestamp,
    );

    this._managerAddress = await getContractAddress(managerName);

    this._rebalanceAuctionModule = await this._coreWrapper.getDeployedRebalanceAuctionModuleAsync();

    await this.distributeComponentsAndSetRecipientApprovals();

    // Issue Rebalancing Sets using _contractOwnerAddress tokens and distrubuted to owner group
    await this.mintInitialSets();

    await this._scenarioValidations.validateInitialState();
  }

  public async runRebalanceScenarios(): Promise<void> {
    // For each rebalance iteration
    for (let i = 0; i < this._rebalanceProgram.scenarioCount; i++) {
      this._currentIteration = i;

      console.log('---------------------------- Running iteration: ', i, '----------------------------');

      // Update prices
      await this._updateOracles();

      console.log('Updated oracles');

      // Issue and Redeem Sets
      await this.issueRebalancingSets();

      console.log('Issued Rebalancing Sets');

      await this.redeemRebalancingSets();

      console.log('Redeemed Rebalancing Sets');

      // Run Proposal (change prices) and transtion to rebalance
      await this.propose();

      console.log('Proposed:');

      await this.startRebalance();

      console.log('Started Rebalance');

      // Run bidding program
      await this.executeBids();

      console.log('Executed Bids');

      // Finish rebalance cycle
      await this.settleRebalance();

      // Execute assertions

      // Log State
      await this.logState();
    }
  }

  /* ============ Private ============ */
  private async distributeComponentsAndSetRecipientApprovals(): Promise<void> {
    const {
      issuerAccounts,
      bidderAccounts,
    } = this._rebalanceProgram;

    const issuerAccountsAddresses: Address[] = _.map(issuerAccounts, accountNumber => this._accounts[accountNumber]);
    const bidderAccountAddresses: Address[] = _.map(bidderAccounts, accountNumber => this._accounts[accountNumber]);
    const recipients: string[] = _.union(issuerAccountsAddresses, bidderAccountAddresses);

    const components = [this._assetOne, this._assetTwo];

    for (let i = 0; i < recipients.length; i++) {
      // Send a large amount of components from the contract deployer to issuer accounts
      await this._erc20Wrapper.transferTokensAsync(
        components,
        recipients[i],
        LARGE_QUANTITY_COMPONENT,
      );

      // Approve components to the transfer proxy
      await this._erc20Wrapper.approveTransfersAsync(
        components,
        this._transferProxy.address,
        recipients[i],
      );
    }
  }

  private async mintInitialSets(): Promise<void> {
    const { rebalancingSetConfig } = this._rebalanceProgram;

    await this.issueRebalancingSets(rebalancingSetConfig.initialSetIssuances);
  }



  public async _updateOracles(): Promise<void> {
    const { priceSchedule } = this._rebalanceProgram;
    const iterationNumber = this._currentIteration;

    const latestBlock = await web3.eth.getBlock('latest');
    const latestBlockTimestamp = new BigNumber(latestBlock.timestamp);

    if (this._assetOneMedianizer) {
      await this._oracleWrapper.updateMedianizerPriceAsync(
        this._assetOneMedianizer,
        priceSchedule.assetOne[iterationNumber],
        latestBlockTimestamp,
      );
      console.log(
        `Updating Oracle 1 to ${priceSchedule.assetOne[iterationNumber]} at iteration ${iterationNumber}`
      );
    }

    if (this._assetTwoMedianizer) {
      await this._oracleWrapper.updateMedianizerPriceAsync(
        this._assetTwoMedianizer,
        priceSchedule.assetTwo[iterationNumber],
        latestBlockTimestamp,
      );
      console.log(
        `Updating Oracle 2 to ${priceSchedule.assetTwo[iterationNumber]} at iteration ${iterationNumber}`
      );
    }
  }

  private async issueRebalancingSets(schedule?: NewIssuanceTxn[]): Promise<void> {
    let currentSchedule;

    if (schedule) {
      currentSchedule = schedule;
    } else {
      const { issuanceSchedule } = this._rebalanceProgram;
      currentSchedule = issuanceSchedule.issuances[this._currentIteration];
    }

    // Loop through issuance schedule and mint Sets from the corresponding sender
    for (let i = 0; i < currentSchedule.length; i++) {
      // Rebalancing Set Quantity
      const rebalancingSetQuantity = currentSchedule[i].amount;
      const sender = this._accounts[currentSchedule[i].sender];

      console.log(
        `Issuing ${rebalancingSetQuantity} RBSet to ${sender} at iteration ${this._currentIteration}`
      );

      await this._rebalancingWrapper.issueRebalancingSetFromBaseComponentsAsync(
        this._core,
        this._transferProxy.address,
        this._rebalancingSetToken.address,
        rebalancingSetQuantity,
        sender
      );
    }
  }

  private async redeemRebalancingSets(): Promise<void> {
    const { issuanceSchedule } = this._rebalanceProgram;
    const currentSchedule = issuanceSchedule.redemptions[this._currentIteration];

    // Loop through issuance schedule and mint Sets from the corresponding sender
    for (let i = 0; i < currentSchedule.length; i++) {
      // Rebalancing Set Quantity
      const rebalancingSetQuantity = currentSchedule[i].amount;
      const sender = this._accounts[currentSchedule[i].sender];

      console.log(
        `Redeeming ${rebalancingSetQuantity} RBSet to ${sender} at iteration ${this._currentIteration}`
      );

      await this._rebalancingWrapper.redeemRebalancingSetToBaseComponentsAsync(
        this._core,
        this._transferProxy.address,
        this._rebalancingSetToken.address,
        rebalancingSetQuantity,
        sender
      );
    }
  }

  private async propose(): Promise<void> {
    // Fast forward the rebalance interval
    await web3Utils.increaseTime(
      this._rebalanceProgram.rebalancingSetConfig.rebalanceInterval.plus(1).toNumber()
    );

    console.log('Calling propose on instance:', this._currentIteration);

    // Call propose from Rebalance Manager and log propose data
    await this._rebalancingWrapper.proposeOnManager(this._managerAddress, this._rebalancingSetToken.address);

    console.log('------------- Proposal ------------- ');
    const nextSet = await this._rebalancingSetToken.nextSet.callAsync();
    const auctionPriceParameters = await this._rebalancingSetToken.getAuctionPriceParameters.callAsync();
    const auctionStartPrice = auctionPriceParameters[2];
    const auctionPivotPrice = auctionPriceParameters[3];
    const fairValue = auctionStartPrice.add(auctionPivotPrice).div(2).round(0, 3);

    console.log('Next Set Address:', nextSet);
    console.log('Auction Start Price: ', auctionStartPrice.toString());
    console.log('Auction Pivot Price: ', auctionPivotPrice.toString());
    console.log('Auction Fair Value: ', fairValue.toString());
  }

  private async startRebalance(): Promise<void> {
    await web3Utils.increaseTime(
      this._rebalanceProgram.rebalancingSetConfig.proposalPeriod.plus(1).toNumber()
    );

    console.log('Starting rebalance', this._currentIteration);

    await this._rebalancingSetToken.startRebalance.sendTransactionAsync();

    console.log('------------- Start Rebalance ------------- ');
    const biddingParameters = await this._rebalancingSetToken.getBiddingParameters.callAsync();
    console.log('Minimum Bid', biddingParameters[0].toString());
    console.log('Initial Remaining Sets', biddingParameters[1].toString());
  }

  private async executeBids(): Promise<void> {
    const { biddingSchedule, managerConfig } = this._rebalanceProgram;

    const currentSchedule = biddingSchedule[this._currentIteration];

    let previousTimeJump = 0;

    const startingCurrentSets = await this._rebalancingSetToken.startingCurrentSetAmount.callAsync();

    const [minimumBid] = await this._rebalancingSetToken.getBiddingParameters.callAsync();

    for (let i = 0; i < currentSchedule.length; i++) {
      const { sender, percentRemainingToBid, secondsFromFairValue } = currentSchedule[i];

      // Note that if there are enough bids, we may not end the auction since there may
      // still be a multiple of the minimum bid remaining
      const bidQuantity = await this._rebalancingWrapper.calculateCurrentSetBidQuantity(
        startingCurrentSets,
        percentRemainingToBid,
        minimumBid,
      );

      const auctionTimeToPivot = new BigNumber(managerConfig.auctionTimeToPivot);

      const timeToFairValue = this._rebalancingWrapper.getTimeToFairValue(auctionTimeToPivot);
      const timeJump = timeToFairValue.plus(secondsFromFairValue).toNumber();

      if (timeJump > previousTimeJump) {
        const timeJumpValue = new BigNumber(timeJump).sub(previousTimeJump).toNumber();

        await web3Utils.increaseTime(timeJumpValue);
        previousTimeJump = timeJump;
      }

      console.log(`Executing Bid of quantity ${bidQuantity.toString()} from ${sender}`);

      await this._rebalanceAuctionModule.bidAndWithdraw.sendTransactionAsync(
        this._rebalancingSetToken.address,
        bidQuantity,
        true,
        { from: this._accounts[sender] }
      );
    }

    // Handle any small remaining Sets
    // const [, remainingCurrentSets] = await this._rebalancingSetToken.getBiddingParameters.callAsync();
    // if (remainingCurrentSets.gt(minimumBid)) {
    //   const bidQuantity = remainingCurrentSets.div(minimumBid).round(0, 3).mul(minimumBid);

    //   await this._rebalanceAuctionModule.bidAndWithdraw.sendTransactionAsync(
    //     this._rebalancingSetToken.address,
    //     bidQuantity,
    //     true,
    //     { from: this._contractOwnerAddress }
    //   );
    // }
  }

  private async settleRebalance(): Promise<void> {
    await this._rebalancingSetToken.settleRebalance.sendTransactionAsync();
  }

  private async logState(): Promise<void> {
    // Log account balances of Set of issuers
    console.log('------------- Issuer Rebalancing Set Balances ------------- ');
    const issuers = this._rebalanceProgram.issuerAccounts;
    for (let i = 0; i < issuers.length; i++) {
      const issuerAddress = this._accounts[issuers[i]];

      const tokenBalance = await this._rebalancingSetToken.balanceOf.callAsync(issuerAddress);
      console.log(issuerAddress, ': ', tokenBalance.toString());
    }

    // Log account balances of components of bidders
  }
}