import { useLocalStorageState } from './utils';
import { Account, clusterApiUrl, Connection } from '@solana/web3.js';
import React, { useContext, useEffect, useMemo } from 'react';
import { setCache, useAsyncData } from './fetch-loop';
import tuple from 'immutable-tuple';

export const ENDPOINTS = [
  {
    name: 'mainnet-beta',
    endpoint: 'https://solana-api.projectserum.com',
  },
  { name: 'testnet', endpoint: clusterApiUrl('testnet') },
  { name: 'devnet', endpoint: clusterApiUrl('devnet') },
  { name: 'localnet', endpoint: 'http://127.0.0.1:8899' },
];

const accountListenerCount = new Map();

const ConnectionContext = React.createContext(null);

export function ConnectionProvider({ children }) {
  const [endpoint, setEndpoint] = useLocalStorageState(
    'connectionEndpts',
    ENDPOINTS[0].endpoint,
  );

  const connection = useMemo(() => new Connection(endpoint, 'recent'), [
    endpoint,
  ]);
  const sendConnection = useMemo(() => new Connection(endpoint, 'recent'), [
    endpoint,
  ]);

  // The websocket library solana/web3.js uses closes its websocket connection when the subscription list
  // is empty after opening its first time, preventing subsequent subscriptions from receiving responses.
  // This is a hack to prevent the list from every getting empty
  useEffect(() => {
    const id = connection.onAccountChange(new Account().publicKey, () => {});
    return () => connection.removeAccountChangeListener(id);
  }, [connection]);

  useEffect(() => {
    const id = connection.onSlotChange(() => null);
    return () => connection.removeSlotChangeListener(id);
  }, [connection]);

  useEffect(() => {
    const id = sendConnection.onAccountChange(
      new Account().publicKey,
      () => {},
    );
    return () => sendConnection.removeAccountChangeListener(id);
  }, [sendConnection]);

  useEffect(() => {
    const id = sendConnection.onSlotChange(() => null);
    return () => sendConnection.removeSlotChangeListener(id);
  }, [sendConnection]);

  return (
    <ConnectionContext.Provider
      value={{ endpoint, setEndpoint, connection, sendConnection }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext).connection;
}

export function useSendConnection() {
  return useContext(ConnectionContext).sendConnection;
}

export function useConnectionConfig() {
  const context = useContext(ConnectionContext);
  return { endpoint: context.endpoint, setEndpoint: context.setEndpoint };
}

export function useAccountInfo(publicKey) {
  const connection = useConnection();
  const cacheKey = tuple(connection, publicKey?.toBase58());
  const [accountInfo, loaded] = useAsyncData(
    async () => (publicKey ? connection.getAccountInfo(publicKey) : null),
    cacheKey,
    { refreshInterval: 60_000 },
  );
  useEffect(() => {
    if (!publicKey) {
      return;
    }
    if (accountListenerCount.has(cacheKey)) {
      let currentItem = accountListenerCount.get(cacheKey);
      ++currentItem.count;
    } else {
      let previousData = null;
      const subscriptionId = connection.onAccountChange(publicKey, (e) => {
        if (e.data) {
          if (!previousData || !previousData.equals(e.data)) {
            setCache(cacheKey, e);
          } else {
          }
          previousData = e.data;
        }
      });
      accountListenerCount.set(cacheKey, { count: 1, subscriptionId });
    }
    return () => {
      let currentItem = accountListenerCount.get(cacheKey);
      let nextCount = currentItem.count - 1;
      if (nextCount <= 0) {
        connection.removeAccountChangeListener(currentItem.subscriptionId);
        accountListenerCount.delete(cacheKey);
      } else {
        --currentItem.count;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);
  return [accountInfo, loaded];
}

export function useAccountData(publicKey) {
  const [accountInfo] = useAccountInfo(publicKey);
  return accountInfo && accountInfo.data;
}
