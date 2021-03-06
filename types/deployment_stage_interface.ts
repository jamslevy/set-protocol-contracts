import BigNumber from 'bignumber.js';

export interface DeploymentStageInterface {
  deploy(web3: any): Promise<any>;
}

interface NetworkConstants {
	production: any;
	staging: any;
	development: any;
}

export interface DeployedSetInfo {
  PRICE_PRECISION: BigNumber;
  WBTC_MULTIPLIER: BigNumber;
  WETH_MULTIPLIER: BigNumber;
  MANAGER_NAME: string;
  COLLATERAL_NAME: string;
  SET_NAME: string;
  SET_SYMBOL: string;
  PROPOSAL_PERIOD: NetworkConstants;
  REBALANCE_INTERVAL: NetworkConstants;
  AUCTION_TIME_TO_PIVOT: NetworkConstants;
  ALLOCATION_LOWER_BOUND: NetworkConstants;
  ALLOCATION_UPPER_BOUND: NetworkConstants;
}