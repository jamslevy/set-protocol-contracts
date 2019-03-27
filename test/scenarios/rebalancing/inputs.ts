import { BigNumber } from 'set-protocol-utils';
import { ZERO } from '@utils/constants';

import { AssetScenario } from './types';
import CONSTANTS from './constants';

import deploymentConstants from '../../../deployments/constants';

import { DEPLOYED_SETS_INFO, DEPENDENCY } from '../../../deployments/deployedContractParameters';

const BITETH_BTC_DOMINANT_CONFIG = DEPLOYED_SETS_INFO.BITETH_BTC_DOMINANT;

export const BITETH_BTC_DOMINANT: AssetScenario  = {
  scenarioCount: 8,
  assetOne: DEPENDENCY.WBTC,
  assetTwo: DEPENDENCY.WETH,
  issuerAccounts: [1, 2],
  bidderAccounts: [3, 4],
  managerConfig: {
    pricePrecision: BITETH_BTC_DOMINANT_CONFIG.PRICE_PRECISION,
    assetOneMultiplier: BITETH_BTC_DOMINANT_CONFIG.WBTC_MULTIPLIER,
    assetTwoMultiplier: BITETH_BTC_DOMINANT_CONFIG.WETH_MULTIPLIER,
    lowerAllocationBound: BITETH_BTC_DOMINANT_CONFIG.ALLOCATION_LOWER_BOUND.production,
    upperAllocationBound: BITETH_BTC_DOMINANT_CONFIG.ALLOCATION_UPPER_BOUND.production,
    auctionTimeToPivot: BITETH_BTC_DOMINANT_CONFIG.AUCTION_TIME_TO_PIVOT.production,
  },
  rebalancingSetConfig: {
    naturalUnit: CONSTANTS.DEFAULT_REBALANCING_NATURAL_UNIT,
    rebalanceInterval: CONSTANTS.THIRTY_DAYS_IN_SECONDS,
    proposalPeriod: CONSTANTS.SECONDS_PER_DAY,
    initialPriceTarget: CONSTANTS.DEFAULT_REBALANCING_NATURAL_UNIT,
    initialAssetOnePrice: deploymentConstants.WBTC.PRICE,
    initialAssetTwoPrice: deploymentConstants.WETH.PRICE,
    initialSetNaturalUnit: CONSTANTS.DEFAULT_REBALANCING_NATURAL_UNIT,
    initialSetIssuances: [
      { sender: 1, amount: new BigNumber(5).mul(10 ** 18) },
      { sender: 2, amount: new BigNumber(1).mul(10 ** 19) },
    ],
  },
  priceSchedule: {
    assetOne: [
      new BigNumber(5000),
      new BigNumber(5000),
      new BigNumber(10000),
      new BigNumber(4000),
      new BigNumber(4000),
      new BigNumber(3000),
      new BigNumber(2000),
      new BigNumber(4000),
    ],
    assetTwo: [
      new BigNumber(150),
      new BigNumber(300),
      new BigNumber(1000),
      new BigNumber(1000),
      new BigNumber(600),
      new BigNumber(500),
      new BigNumber(2500),
      new BigNumber(1000),
    ],
  },
  issuanceSchedule: {
    issuances: [
      [], // Month 1
      [ // Month 2
        { sender: 1, amount: new BigNumber(5).mul(10 ** 18) },
        { sender: 2, amount: new BigNumber(2).mul(10 ** 18) },
      ],
      [], // Month 3
      [{ sender: 1, amount: new BigNumber(5).mul(10 ** 18) }], // Month 4
      [{ sender: 1, amount: new BigNumber(5).mul(10 ** 18) }], // Month 5
      [], // Month 6
      [{ sender: 1, amount: new BigNumber(5).mul(10 ** 18) }], // Month 7
      [{ sender: 1, amount: new BigNumber(5).mul(10 ** 18) }], // Month 8
    ],
    redemptions: [
      [  // Month 1
        { sender: 1, amount: new BigNumber(1).mul(10 ** 18) },
        { sender: 2, amount: new BigNumber(2).mul(10 ** 18) },
      ],
      [], // Month 2
      [ // Month 3
        { sender: 1, amount: new BigNumber(1).mul(10 ** 18) },
        { sender: 2, amount: new BigNumber(2).mul(10 ** 18) },
      ],
      [], // Month 4
      [], // Month 5
      [
        { sender: 1, amount: new BigNumber(5).mul(10 ** 18) },
        { sender: 2, amount: new BigNumber(2).mul(10 ** 18) },
      ], // Month 6
      [], // Month 7
      [], // Month 8
    ],
  },
  biddingSchedule: [
    [ // Month 1
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
    ],
    [ // Month 2
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: new BigNumber(-3600) },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: new BigNumber(-3600) },
    ],
    [ // Month 3
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
    ],
    [ // Month 4
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: new BigNumber(3600) },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: new BigNumber(3600) },
    ],
    [ // Month 5
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
    ],
    [ // Month 6
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
    ],
    [ // Month 7
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
    ],
    [ // Month 8
      { sender: 3, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
      { sender: 4, percentRemainingToBid: 50, secondsFromFairValue: ZERO },
    ],
  ],
};
