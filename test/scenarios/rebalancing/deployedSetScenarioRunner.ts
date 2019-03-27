require('module-alias/register');

import * as _ from 'lodash';
import * as setProtocolUtils from 'set-protocol-utils';
import { Address, Web3Utils } from 'set-protocol-utils';
import { BigNumber } from 'set-protocol-utils';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  BTCETHRebalancingManagerContract,
  CoreMockContract,
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
  UserAccountData,
  TokenBalances,
  UserTokenBalances,
  IssuanceTxn,
  IssuanceSchedule,
  TokenPrices,
  BidTxn,
  SingleRebalanceCycleScenario,
  FullRebalanceProgram,
  DataOutput,
} from './types';

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

export class RebalanceScenariosWrapper {
  private _accounts: UserAccountData;
  private _rebalanceProgram: AssetScenario;
  private _dataLogger: DataOutput;

  private _contractOwnerAddress: Address;
  private _coreWrapper: CoreWrapper;
  private _erc20Wrapper: ERC20Wrapper;
  private _oracleWrapper: OracleWrapper;
  private _rebalancingWrapper: RebalancingWrapper;

  private _rebalancingSetToken: RebalancingSetTokenContract;

  private _coreMock: CoreMockContract;
  private _transferProxy: TransferProxyContract;
  private _vault: VaultContract;
  private _rebalanceAuctionModule: RebalanceAuctionModuleContract;
  private _factory: SetTokenFactoryContract;
  private _rebalancingComponentWhiteList: WhiteListContract;
  private _rebalancingFactory: RebalancingSetTokenFactoryContract;
  private _linearAuctionPriceCurve: LinearAuctionPriceCurveContract;
  private _btcethRebalancingManager: BTCETHRebalancingManagerContract;
  private _btcMedianizer: MedianContract;
  private _ethMedianizer: MedianContract;

  private _wrappedBTC: StandardTokenMockContract;
  private _wrappedETH: WethMockContract;
  private _initialBtcEthSet: SetTokenContract;

  constructor(otherAccounts: Address[], rebalanceProgram: AssetScenario) {
    this._contractOwnerAddress = otherAccounts[0];
    this._rebalanceProgram = rebalanceProgram;
    this._accounts = this._createAccountPersonalitiesAsync(otherAccounts);

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
    await this.runRebalanceScenarios();
  }

  public async initialize(): Promise<void> {
    // Issue Rebalancing Sets using _contractOwnerAddress tokens and distrubuted to owner group
    await this._distributeComponentsToIssuers();

    await this._mintInitialSets();
  }

  public async runRebalanceScenarios(
    scenarios: SingleRebalanceCycleScenario[],
  ): Promise<void> {
    // For each rebalance iteration
    for (let i = 0; i < this._rebalanceProgram.rebalanceIterations; i++) {
      const scenario = scenarios[i];

      // Update prices
      await this._updateOracles();

      // Issue and Redeem Sets
      await this._executeIssuanceScheduleAsync(scenario.issuanceSchedule);

      // Run Proposal (change prices) and transtion to rebalance
      await this._propose(scenario.priceUpdate);

      // Prepare scenario
      await this._fundBidders();

      await this._transitionToRebalance();

      // Run bidding program
      await this._executeBiddingScheduleAsync(scenario.biddingSchedule, scenario.priceUpdate);
      // Finish rebalance cycle
      await this._settleRebalanceAndLogState();

      // Execute assertions
    }
  }

  /* ============ Private ============ */

  function _distributeComponentsToIssuers() {

  }

}