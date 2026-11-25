import utils from './utils';

// The hooks log whole account objects, which hold the signer's private key, and pkcOptions, whose kubo
// rpc options can carry authorization headers, and errors can carry the same. Never show anything that
// looks like a secret. Key names are matched whole, so `author` and `authorAddress` stay visible.
const SECRET_KEY_NAMES = 'privateKey|password|passphrase|secret|authKey|pkcRpcAuthKey|authorization|auth|headers|mnemonic|seed|token|apiKey|api_key';
const SECRET_KEY = new RegExp(`^(?:${SECRET_KEY_NAMES})$`, 'i');
const SECRET_FIELD = new RegExp(
  `((?:"|')?\\b(?:${SECRET_KEY_NAMES})(?:"|')?\\s*[:=]\\s*)(\\{[^{}]*\\}|"[^"]*"|'[^']*'|(?:Bearer|Basic|Token)\\s+[^\\s,}]+|[^\\s,}]+)`,
  'gi',
);
const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s"'<>]+/g;

export const isSecretKey = (key: string): boolean => SECRET_KEY.test(key);

const hasOrigin = (url: string, origin: string): boolean => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

// secret fields written out in text, and endpoint urls, whose paths and queries can carry credentials.
// Urls on `keepOrigin` are left whole: the app's own urls, such as the code locations in a stack.
export const redactSecrets = (text: string, keepOrigin?: string): string =>
  text.replace(SECRET_FIELD, '$1"[redacted]"').replace(URL_PATTERN, (url) => (keepOrigin && hasOrigin(url, keepOrigin) ? url : utils.getRedactedUrl(url)));

// a JSON.stringify replacer that drops the values of secret keys
export const secretReplacer = (key: string, value: unknown): unknown => (isSecretKey(key) ? '[redacted]' : value);
