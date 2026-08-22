const { contextBridge, ipcRenderer } = require('electron'); // electron preload can't use import

// dev uses http://localhost, prod uses file://...index.html
const isDev = window.location.protocol === 'http:';

const defaultPkcOptions = {
  pkcRpcClientsOptions: ['ws://localhost:9138'],
};

contextBridge.exposeInMainWorld('defaultPkcOptions', defaultPkcOptions);
// bitsocial doesn't run the ipfs dht, nfts are only seeded using ipfs dht, so can't use localhost
// contextBridge.exposeInMainWorld('defaultMediaIpfsGatewayUrl', 'http://localhost:6473')

// receive pkc rpc auth key from main
ipcRenderer.on('pkc-rpc-auth-key', (event, pkcRpcAuthKey) => contextBridge.exposeInMainWorld('pkcRpcAuthKey', pkcRpcAuthKey));
ipcRenderer.send('get-pkc-rpc-auth-key');

// uncomment for logs
// localStorage.debug = 'pkc-js:*,bitsocial-react-hooks:*,bitbones:*'
