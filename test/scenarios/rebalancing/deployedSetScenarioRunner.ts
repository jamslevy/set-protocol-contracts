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
  LinearAuctionPriceCurveContract,
  MedianContract,
  RebalanceAuctionModuleContract,
  RebalancingSetTokenContract,
  RebalancingSetTokenFactoryContract,
  SetTokenContract,
  SetTokenFactoryContract,
  StandardTokenMockContract,
  TransferProxyContract,
  VaultContract,
  WhiteListContract,
  WethMockContract,
} from '@utils/contracts';
import {
  UNLIMITED_ALLOWANCE_IN_BASE_UNITS,
} from '@utils/constants';
import { Blockchain } from '@utils/blockchain';
import { getWeb3 } from '@utils/web3Helper';

import {
  AssetScenario,
  UserAccountData,
  TokenBalances,
  UserTokenBalances,
  NewIssuanceTxn,
  TokenPrices,
  BidTxn,
  SingleRebalanceCycleScenario,
  FullRebalanceProgram,
} from './types';

import { RebalancingScenarioValidations } from './validations';

import { DEPLOYED_SETS_INFO, DEPENDENCY } from '../../../deployments/deployedContractParameters';
import deployedDependencies from '../../../deployments/dependencies';

import {
  findDependency,
  getContractAddress,
} from '../../../deployments/utils/output-helper';

import { CoreWrapper } from '@utils/wrappers/coreWrapper';
import { ERC20Wrapper } from '@utils/wrappers/erc20Wrapper';
import { OracleWrapper } from '@utils/wrappers/oracleWrapper';
import { RebalancingWrapper } from '@utils/wrappers/rebalancingWrapper';

BigNumberSetup.configure();
ChaiSetup.configure();
const web3 = getWeb3();
const blockchain = new Blockchain(web3);
const { SetProtocolTestUtils: SetTestUtils, SetProtocolUtils: SetUtils } = setProtocolUtils;
const web3Utils = new Web3Utils(web3);

const LARGE_QUANTITY_COMPONENT = new BigNumber(10 ** 30);

export class RebalanceScenariosWrapper {
  private _accounts: Address[];
  private _rebalanceProgram: AssetScenario;
  private _currentIteration: number;

  private _deployedBaseSets: Address[];

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
  private _factory: SetTokenFactoryContract;
  private _rebalancingComponentWhiteList: WhiteListContract;
  private _rebalancingFactory: RebalancingSetTokenFactoryContract;
  private _linearAuctionPriceCurve: LinearAuctionPriceCurveContract;
  private _btcethRebalancingManager: BTCETHRebalancingManagerContract;
  private _assetOneMedianizer: MedianContract;
  private _assetTwoMedianizer: MedianContract;

  private rebalancingSetAddress: Address;

  private _initialBtcEthSet: SetTokenContract;

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
    } = this._rebalanceProgram;

    const assetOneAddress = await findDependency(assetOne);
    const assetTwoAddress = await findDependency(assetTwo);
    const components = await this._erc20Wrapper.retrieveTokenInstancesAsync([assetOneAddress, assetTwoAddress]);
    this._assetOne = components[0];    
    this._assetTwo = components[1];
    
    const rebalancingSetAddress = await getContractAddress(rebalancingSetName);
    this._rebalancingSetToken = await this._rebalancingWrapper.getRebalancingSetInstance(rebalancingSetAddress);
    this._deployedBaseSets = [await getContractAddress(collateralSetName)];

    const assetOneMedianizerAddress = await getContractAddress(DEPENDENCY.WBTC_MEDIANIZER);
    this._assetOneMedianizer = await this._oracleWrapper.getDeployedMedianizerAsync(assetOneMedianizerAddress);
    await this._oracleWrapper.addPriceFeedOwnerToMedianizer(this._assetOneMedianizer, this._contractOwnerAddress);

    const assetTwoMedianizerAddress = await getContractAddress(DEPENDENCY.WETH_MEDIANIZER);
    this._assetTwoMedianizer = await this._oracleWrapper.getDeployedMedianizerAsync(assetOneMedianizerAddress);
    await this._oracleWrapper.addPriceFeedOwnerToMedianizer(this._assetTwoMedianizer, this._contractOwnerAddress);

    await this._distributeComponentsAndSetRecipientApprovals();

    // Issue Rebalancing Sets using _contractOwnerAddress tokens and distrubuted to owner group
    await this._mintInitialSets();

    await this._scenarioValidations.validateInitialState();
  }

  /* ============ Private ============ */
  private async _distributeComponentsAndSetRecipientApprovals(): Promise<void> {
    const {
      issuerAccounts,
      bidderAccounts,
      assetOne,
      assetTwo,
      rebalancingSetConfig,
      collateralSetName,
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

  private async _mintInitialSets(): Promise<void> {
    const { rebalancingSetConfig } = this._rebalanceProgram;

    await this.issueRebalancingSets(rebalancingSetConfig.initialSetIssuances);
  }

  public async runRebalanceScenarios(
  ): Promise<void> {
    // For each rebalance iteration
    for (let i = 0; i < this._rebalanceProgram.scenarioCount; i++) {
      this._currentIteration = i;

      console.log("---------------------------- Running iteration: ", i, "----------------------------");

      // Update prices
      await this._updateOracles();

      console.log("Updated oracles", i);

      // Issue and Redeem Sets
      await this.issueRebalancingSets();

      console.log("Issued Rebalancing Sets", i);

      await this.redeemRebalancingSets();

      console.log("Redeemed Rebalancing Sets", i);

      // // Run Proposal (change prices) and transtion to rebalance
      // await this._propose(scenario.priceUpdate);

      // console.log("Proposed:", i);

      // await this._transitionToRebalance();

      // console.log("Transitioning to Rebalance:", i);

      // // Run bidding program
      // await this._executeBiddingScheduleAsync(scenario.biddingSchedule, scenario.priceUpdate);
      // // Finish rebalance cycle
      // await this._settleRebalanceAndLogState();

      // Execute assertions


      // Log State
      await this.logState();
    }
  }

  public async _updateOracles(): Promise<void> {
    const { priceSchedule } = this._rebalanceProgram;
    const iterationNumber = this._currentIteration;

    if (this._assetOneMedianizer) {
      await this._oracleWrapper.updateMedianizerPriceAsync(
        this._assetOneMedianizer,
        priceSchedule.assetOne[iterationNumber],
        SetTestUtils.generateTimestamp(1000),
      );
      console.log(
        `Updating Oracle 1 to ${priceSchedule.assetOne[iterationNumber]} at iteration ${iterationNumber}`
      );
    }

    if (this._assetTwoMedianizer) {
      await this._oracleWrapper.updateMedianizerPriceAsync(
        this._assetTwoMedianizer,
        priceSchedule.assetTwo[iterationNumber],
        SetTestUtils.generateTimestamp(1000),
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