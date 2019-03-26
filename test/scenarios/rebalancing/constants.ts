import BigNumber from 'bignumber.js';

const SECONDS_PER_DAY = new BigNumber(86400);

export default {
	// TIME: {
	SECONDS_PER_DAY: SECONDS_PER_DAY,
	
	// PROTOCOL
	PRICE_DIVISOR: new BigNumber(1000),
	
	// BASE_SET
	SET_FULL_TOKEN_UNITS: new BigNumber(10 ** 18),
	
	// REBALANCING_SET
	DEFAULT_REBALANCING_NATURAL_UNIT: new BigNumber(10 ** 6),
	REBALANCING_SET_USD_PRICE: new BigNumber(100),
	REBALANCE_INTERVAL: new BigNumber(28).mul(SECONDS_PER_DAY),
	PROPOSAL_PERIOD: new BigNumber(1).mul(SECONDS_PER_DAY),
	TIME_TO_PIVOT: new BigNumber(SECONDS_PER_DAY),
	
	// MANAGER
    DEFAULT_COLLATERAL_NATURAL_UNIT: new BigNumber(10 ** 10), 
    WETH_DOMINANT_COLLATERAL_NATURAL_UNIT: new BigNumber(10 ** 12),
	// ASSET: {
	WBTC: {
		DECIMALS: 8,
		FULL_UNIT: new BigNumber(10 ** 8),
		DEFAULT_UNIT: new BigNumber(1),
	},
	WETH: {
		DECIMALS: 18,
		FULL_UNIT: new BigNumber(10 ** 18),
	}
}