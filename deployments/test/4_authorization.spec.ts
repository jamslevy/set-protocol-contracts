'use strict';

import expect from 'expect';

import { getNetworkConstant, getContractAddress } from '../utils/output-helper';
import { getWeb3Instance } from '../utils/blockchain';

import { Core } from '../../artifacts/ts/Core';
import { ExchangeIssuanceModule } from '../../artifacts/ts/ExchangeIssuanceModule';
import { KyberNetworkWrapper } from '../../artifacts/ts/KyberNetworkWrapper';
import { LinearAuctionPriceCurve } from '../../artifacts/ts/LinearAuctionPriceCurve';
import { RebalanceAuctionModule } from '../../artifacts/ts/RebalanceAuctionModule';
import { RebalancingSetExchangeIssuanceModule } from '../../artifacts/ts/RebalancingSetExchangeIssuanceModule';
import { RebalancingSetTokenFactory } from '../../artifacts/ts/RebalancingSetTokenFactory';
import { SetTokenFactory } from '../../artifacts/ts/SetTokenFactory';
import { TransferProxy } from '../../artifacts/ts/TransferProxy';
import { Vault } from '../../artifacts/ts/Vault';
import { ZeroExExchangeWrapper } from '../../artifacts/ts/ZeroExExchangeWrapper';
import { WhiteList } from '../../artifacts/ts/WhiteList';

import networkConstants from '../network-constants';

describe('Deployment: Authorization', () => {

  let web3;
  const networkName = getNetworkConstant();

  let coreAddress;
  let vaultAddress;

  let coreContract;

  before(async () => {
    web3 = await getWeb3Instance();

    coreAddress = await getContractAddress(Core.contractName);
    vaultAddress = await getContractAddress(Vault.contractName);

    coreContract = new web3.eth.Contract(Core.abi, coreAddress);
  });

  describe('Timelocks', () => {
    const expectedGeneralTimeLockPeriod = networkConstants.generalTimeLockPeriod[networkName];

    it('correct timelock applied to core', async () => {
      const timelock = await coreContract.methods.timeLockPeriod().call();
      expect(parseInt(timelock)).toEqual(expectedGeneralTimeLockPeriod);
    });

    it('correct timelock applied to transfer proxy', async () => {
      const transferProxyAddress = await getContractAddress(TransferProxy.contractName);
      const transferProxyContract = new web3.eth.Contract(TransferProxy.abi, transferProxyAddress);

      const timelock = await transferProxyContract.methods.timeLockPeriod().call();
      const expectedTransferProxyTimeLockPeriod = networkConstants.transferProxyTimeLockPeriod[networkName];
      expect(parseInt(timelock)).toEqual(expectedTransferProxyTimeLockPeriod);
    });

    it('correct timelock applied to vault', async () => {
      const vaultContract = new web3.eth.Contract(Vault.abi, vaultAddress);

      const timelock = await vaultContract.methods.timeLockPeriod().call();
      const expectedVaultTimeLockPeriod = networkConstants.vaultTimeLockPeriod[networkName];

      expect(parseInt(timelock)).toEqual(expectedVaultTimeLockPeriod);
    });

    it('correct timelock applied to white list', async () => {
      const whiteListAddress = await getContractAddress(WhiteList.contractName);
      const vaultContract = new web3.eth.Contract(WhiteList.abi, whiteListAddress);
      const timelock = await vaultContract.methods.timeLockPeriod().call();
      expect(parseInt(timelock)).toEqual(expectedGeneralTimeLockPeriod);
    });
  });

  describe('Authorized Vault addresses', () => {
    let vaultContract;
    let authorisedAddresses;

    before(async () => {
      vaultContract = new web3.eth.Contract(Vault.abi, vaultAddress);
      authorisedAddresses = await vaultContract.methods.getAuthorizedAddresses().call();
    });

    it('vault contains core as authorised address', async () => {
      expect(authorisedAddresses).toContain(coreAddress);
    });
  });

  describe('Authorized Transfer Proxy addresses', () => {
    let transferProxyContract;
    let authorisedAddresses;

    before(async () => {
      const transferProxyAddress = await getContractAddress(TransferProxy.contractName);
      transferProxyContract = new web3.eth.Contract(TransferProxy.abi, transferProxyAddress);
      authorisedAddresses = await transferProxyContract.methods.getAuthorizedAddresses().call();
    });

    it('transfer proxy contains core as authorised address', async () => {
      expect(authorisedAddresses).toContain(coreAddress);
    });
  });

  describe('Factories in Core', () => {
    let factories;

    before(async () => {
      factories = await coreContract.methods.factories().call();
    });

    it('core contains set token factory', async () => {
      const setTokenFactoryAddress = await getContractAddress(SetTokenFactory.contractName);
      expect(factories).toContain(setTokenFactoryAddress);
    });

    it('core contains rebalancing set token factory', async () => {
      const rebalancingSetTokenFactoryAddress = await getContractAddress(RebalancingSetTokenFactory.contractName);
      expect(factories).toContain(rebalancingSetTokenFactoryAddress);
    });
  });

  describe('Modules in Core', () => {
    let modules;

    before(async () => {
      modules = await coreContract.methods.modules().call();
    });

    it('core contains exchange issuance module', async () => {
      const exchangeIssueModuleAddress = await getContractAddress(ExchangeIssuanceModule.contractName);
      expect(modules).toContain(exchangeIssueModuleAddress);
    });

    it('core contains rebalancing Set exchange issuance module', async () => {
      const rebalancingSetExchangeIssuanceModuleAddress = await getContractAddress(
        RebalancingSetExchangeIssuanceModule.contractName
      );
      expect(modules).toContain(rebalancingSetExchangeIssuanceModuleAddress);
    });

    it('core contains rebalancing auction module', async () => {
      const rebalanceAuctionModule = await getContractAddress(RebalanceAuctionModule.contractName);
      expect(modules).toContain(rebalanceAuctionModule);
    });
  });

  describe('Exchanges in Core', () => {
    let exchanges;

    before(async () => {
      exchanges = await coreContract.methods.exchanges().call();
    });

    it('core contains zero ex exchange wrapper', async () => {
      const zeroExAddress = await getContractAddress(ZeroExExchangeWrapper.contractName);
      expect(exchanges).toContain(zeroExAddress);
    });

    it('core contains kyber network exchange wrapper', async () => {
      const kyberNetworkAddress = await getContractAddress(KyberNetworkWrapper.contractName);
      expect(exchanges).toContain(kyberNetworkAddress);
    });
  });

  describe('Price Libraries in Core', () => {
    let priceLibraries;

    before(async () => {
      priceLibraries = await coreContract.methods.priceLibraries().call();
    });

    it('core contains linear auction price curve', async () => {
      if (!networkConstants.linearAuctionPriceCurve[networkName]) {
        return;
      }
      const linearAuctionPriceCurveAddress = await getContractAddress(LinearAuctionPriceCurve.contractName);
      expect(priceLibraries).toContain(linearAuctionPriceCurveAddress);
    });
  });
});
