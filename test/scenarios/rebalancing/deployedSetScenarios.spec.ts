require('module-alias/register');

import * as chai from 'chai';
import * as _ from 'lodash';
import * as ABIDecoder from 'abi-decoder';
import { BigNumber } from 'set-protocol-utils';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import { Blockchain } from '@utils/blockchain';
import { getWeb3 } from '@utils/web3Helper';

import { getScenarioData } from './scenarioData';
import { BITETH_BTC_DOMINANT } from './inputs';

import {
  DataOutput,
  FullRebalanceProgram,
} from './types';

import { RebalanceScenariosWrapper } from './deployedSetScenarios';

BigNumberSetup.configure();
ChaiSetup.configure();
const web3 = getWeb3();
const Core = artifacts.require('Core');
const RebalancingSetToken = artifacts.require('RebalancingSetToken');
const RebalanceAuctionModule = artifacts.require('RebalanceAuctionModule');
const { expect } = chai;
const blockchain = new Blockchain(web3);


contract('Multiple Rebalance BTC-ETH 50/50', accounts => {

  let rebalanceScenariosWrapper: RebalanceScenariosWrapper;
  let scenarioData: FullRebalanceProgram;

  before(async () => {
    ABIDecoder.addABI(Core.abi);
    ABIDecoder.addABI(RebalanceAuctionModule.abi);
    ABIDecoder.addABI(RebalancingSetToken.abi);
  });

  after(async () => {
    ABIDecoder.removeABI(Core.abi);
    ABIDecoder.removeABI(RebalanceAuctionModule.abi);
    ABIDecoder.removeABI(RebalancingSetToken.abi);
  });

  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();

    scenarioData = getScenarioData(accounts);

    rebalanceScenariosWrapper = new RebalanceScenariosWrapper(accounts, scenarioData);
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });

  async function subject(): Promise<DataOutput> {
    return rebalanceScenariosWrapper.runFullRebalanceProgram();
  }

  describe('BTCETH_BTC_DOMINANT', async () => {
   
  });


});