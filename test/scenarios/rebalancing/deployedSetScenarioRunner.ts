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

const Vault = artifacts.require('Vault');

export class RebalanceScenariosWrapper {
  private _accounts: Address[];
  private _rebalanceProgram: AssetScenario;

  private _deployedBaseSets: Address[];

  private _contractOwnerAddress: Address;
  private _coreWrapper: CoreWrapper;
  private _erc20Wrapper: ERC20Wrapper;
  private _oracleWrapper: OracleWrapper;
  private _rebalancingWrapper: RebalancingWrapper;

  private _rebalancingSetToken: RebalancingSetTokenContract;

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

    // Set all the deployed addresses    
  }

  public async runFullRebalanceProgram(): Promise<void> {
    await this.initialize();
    // await this.runRebalanceScenarios();
  }

  public async initialize(): Promise<void> {
    const {
      issuerAccounts,
      bidderAccounts,
      assetOne,
      assetTwo,
      rebalancingSetConfig,
      collateralSetName,
    } = this._rebalanceProgram;

    this._deployedBaseSets = [await getContractAddress(collateralSetName)];

    const issuerAccountsAddresses: Address[] = _.map(issuerAccounts, accountNumber => this._accounts[accountNumber]);
    const bidderAccountAddresses: Address[] = _.map(bidderAccounts, accountNumber => this._accounts[accountNumber]);
    const recipients: string[] = _.union(issuerAccountsAddresses, bidderAccountAddresses);

    const assetOneAddress = await findDependency(assetOne);
    const assetTwoAddress = await findDependency(assetTwo);
    const components = await this._erc20Wrapper.retrieveTokenInstancesAsync([assetOneAddress, assetTwoAddress]);

    for (let i = 0; i < recipients.length; i++) {
      // Send a large amount of components from the contract deployer to issuer accounts
      await this._erc20Wrapper.transferTokensAsync(
        components,
        recipients[i],
        LARGE_QUANTITY_COMPONENT,
      );

      const vaultAddress = await getContractAddress(Vault.contractName);

      // Approve components to the transfer proxy
      await this._erc20Wrapper.approveTransfersAsync(
        components,
        vaultAddress,
        recipients[i],
      );
    }

    // Issue Rebalancing Sets using _contractOwnerAddress tokens and distrubuted to owner group
    await this._mintInitialSets();
  }

  /* ============ Private ============ */
  private async _mintInitialSets(): Promise<void> {
    const { rebalancingSetConfig } = this._rebalanceProgram;

    await this.issueRebalancingSets(rebalancingSetConfig.initialSetIssuances);
  }

  private async issueRebalancingSets(issuanceSchedule: NewIssuanceTxn[]): Promise<void> {
    const { rebalancingSetName } = this._rebalanceProgram;

    const currentSetAddress = _.last(this._deployedBaseSets);

    const currentSetInstance = await this._coreWrapper.getRebalancingInstanceFromAddress(currentSetAddress);


    const rebalancingSetAddress = await getContractAddress(rebalancingSetName);

    const rebalancingSet = await this._coreWrapper.getRebalancingInstanceFromAddress(rebalancingSetAddress);

    // Loop through issuance schedule and mint Sets from the corresponding sender
    for (let i = 0; i < issuanceSchedule.length; i++) {
      // Rebalancing Set Quantity
      const rebalancingSetQuantity = issuanceSchedule[i].amount;

      const currentSetNaturalUnit = await currentSetInstance.naturalUnit.callAsync();

      const rebalancingSetUnitShares = await this._rebalancingSetToken.unitShares.callAsync();
      const rebalancingSetNaturalUnit = await this._rebalancingSetToken.naturalUnit.callAsync();
      const currentSetRequiredAmountUnrounded = issuanceSchedule[i].amount
                                         .mul(rebalancingSetUnitShares)
                                         .div(rebalancingSetNaturalUnit)
                                         .round(0, 3);
      const currentSetRequiredAmount = currentSetRequiredAmountUnrounded.sub(
        currentSetRequiredAmountUnrounded.modulo(currentSetNaturalUnit)
      ).add(currentSetNaturalUnit);

      await this._core.issue.sendTransactionAsync(
        currentSetInstance.address,
        currentSetRequiredAmount,
        { from: this._accounts[issuanceSchedule[i].sender] },
      );
      await currentSetInstance.approve.sendTransactionAsync(
        this._transferProxy.address,
        UNLIMITED_ALLOWANCE_IN_BASE_UNITS,
        { from: this._accounts[issuanceSchedule[i].sender] },
      );
      await this._core.issue.sendTransactionAsync(
        this._rebalancingSetToken.address,
        issuanceSchedule[i].amount,
        { from: this._accounts[issuanceSchedule[i].sender] },
      );
    }
  }

  // public async runRebalanceScenarios(
  //   scenarios: SingleRebalanceCycleScenario[],
  // ): Promise<void> {
  //   // For each rebalance iteration
  //   for (let i = 0; i < this._rebalanceProgram.rebalanceIterations; i++) {
  //     const scenario = scenarios[i];

  //     // Update prices
  //     await this._updateOracles();

  //     // Issue and Redeem Sets
  //     await this._executeIssuanceScheduleAsync(scenario.issuanceSchedule);

  //     // Run Proposal (change prices) and transtion to rebalance
  //     await this._propose(scenario.priceUpdate);

  //     // Prepare scenario
  //     await this._fundBidders();

  //     await this._transitionToRebalance();

  //     // Run bidding program
  //     await this._executeBiddingScheduleAsync(scenario.biddingSchedule, scenario.priceUpdate);
  //     // Finish rebalance cycle
  //     await this._settleRebalanceAndLogState();

  //     // Execute assertions
  //   }
  // }
}