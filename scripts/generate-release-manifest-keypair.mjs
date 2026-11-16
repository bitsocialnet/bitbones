// Prints a new ECDSA P-256 keypair for signing the release manifest. To rotate the key: store the
// PEM as the repository secret, replace scripts/release-manifest-public-key.json with the public
// part under a new keyId, and update every verifier that pins the old key.

import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const keyId = `bitbones-release-p256-${new Date().toISOString().slice(0, 7)}`;

console.log('# Store this PEM as the GitHub secret RELEASE_MANIFEST_PRIVATE_KEY_PEM.');
console.log(privateKey.export({ format: 'pem', type: 'sec1' }).toString().trim());
console.log('\n# Commit this as scripts/release-manifest-public-key.json, and pin it in every verifier.');
console.log(JSON.stringify({ keyId, publicKeyJwk: publicKey.export({ format: 'jwk' }) }, null, 2));
