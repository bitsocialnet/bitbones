import tcpPortUsed from 'tcp-port-used';
import EnvPaths from 'env-paths';
import { randomBytes } from 'crypto';
import fs from 'fs-extra';
import PKCRpc from '@pkcprotocol/pkc-js/rpc';
import path from 'path';
import { fileURLToPath } from 'url';
import isDev from 'electron-is-dev';
import { createDefaultPkcOptions } from './pkc-rpc-options.js';
const dirname = path.join(path.dirname(fileURLToPath(import.meta.url)));
const envPaths = EnvPaths('pkc', { suffix: false });

// always run the local pkc rpc on this port so every bitsocial desktop client can reuse the same node
const port = 9138;
const defaultPkcOptions = createDefaultPkcOptions({
  // find the user's OS data path
  dataPath: !isDev ? envPaths.data : path.join(dirname, '..', '.pkc'),
});

// generate pkc rpc auth key if doesn't exist
const pkcRpcAuthKeyPath = path.join(defaultPkcOptions.dataPath, 'auth-key');
let pkcRpcAuthKey;
try {
  pkcRpcAuthKey = fs.readFileSync(pkcRpcAuthKeyPath, 'utf8');
} catch (e) {
  pkcRpcAuthKey = randomBytes(32).toString('base64').replace(/[/+=]/g, '').substring(0, 40);
  fs.ensureFileSync(pkcRpcAuthKeyPath);
  fs.writeFileSync(pkcRpcAuthKeyPath, pkcRpcAuthKey);
}

const startPkcRpcAutoRestart = async () => {
  let pendingStart = false;
  const start = async () => {
    if (pendingStart) {
      return;
    }
    pendingStart = true;
    try {
      const started = await tcpPortUsed.check(port, '127.0.0.1');
      if (!started) {
        const pkcWebSocketServer = await PKCRpc.PKCWsServer({ port, pkcOptions: defaultPkcOptions, authKey: pkcRpcAuthKey });
        pkcWebSocketServer.on('error', (e) => console.log('pkc rpc error', e));

        console.log(`pkc rpc: listening on ws://localhost:${port} (local connections only)`);
        console.log(`pkc rpc: listening on ws://localhost:${port}/${pkcRpcAuthKey} (secret auth key for remote connections)`);
        pkcWebSocketServer.ws.on('connection', (socket, request) => {
          console.log('pkc rpc: new connection');
          // debug raw JSON RPC messages in console
          if (isDev) {
            socket.on('message', (message) => console.log(`pkc rpc: ${message.toString()}`));
          }
        });
      }
    } catch (e) {
      console.log('failed starting pkc rpc server', e);
    }
    pendingStart = false;
  };

  // retry starting the pkc rpc server every 1 second,
  // in case it was started by another client that shut down and shut down the server with it
  start();
  setInterval(() => {
    start();
  }, 1000);
};
startPkcRpcAutoRestart();
