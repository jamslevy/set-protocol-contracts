import { Address } from 'set-protocol-utils';
import { BigNumber } from 'set-protocol-utils';

import { AssetScenario } from './types';
import CONSTANTS from './constants';


const BTCETH5050: AssetScenario  = {
  managerConfig: {
    btcMultiplier: new BigNumber(),
    ethMultiplier: new BigNumber(),
    lowerAllocationBound: new BigNumber(),
    upperAllocationBound: new BigNumber(),
    auctionTimeToPivot: new BigNumber(),
  },
  rebalancingSetConfig: {
    unitShares: new BigNumber(),
    naturalUnit: new BigNumber(),
    rebalanceInterval: new BigNumber(),
    proposalPeriod: new BigNumber(),
    initialTokenPrices: new BigNumber(),
    initialSetIssueQuantity: new BigNumber(),
    initialSetUnits: new BigNumber(),
    initialSetNaturalUnit: new BigNumber(),
  },
  priceSchedule: {
    assetOne: [],
    assetTwo: [],
  },
  issuanceSchedule: {
    issuances: [],
    redemptions: [],
  },
  biddingSchedule: {
    assetOne: [],
    assetTwo: [],
  },
};
