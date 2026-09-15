#!/usr/bin/env node

import { createHmac, generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { githubAppJwt, verifyGitHubWebhook } from '../src/github-app.ts';

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const webhookSecret = 'factory-github-webhook-test-secret';
const env = {
  GITHUB_APP_ID: '1234567',
  GITHUB_APP_PRIVATE_KEY: privatePem,
  GITHUB_WEBHOOK_SECRET: webhookSecret,
};

const before = Math.floor(Date.now() / 1000);
const jwt = await githubAppJwt(env);
const after = Math.floor(Date.now() / 1000);
const parts = jwt.split('.');
if (parts.length !== 3) throw new Error(`Expected three JWT parts, got ${parts.length}`);

const payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
if (payload.iss !== '1234567') throw new Error(`Unexpected JWT issuer: ${payload.iss}`);
if (payload.iat > after || payload.iat < before - 61) throw new Error(`Unexpected JWT iat: ${payload.iat}`);
if (payload.exp <= after || payload.exp > after + 10 * 60) throw new Error(`Unexpected JWT exp: ${payload.exp}`);

const signingInput = `${parts[0]}.${parts[1]}`;
const signatureOk = verifySignature(
  'RSA-SHA256',
  Buffer.from(signingInput),
  publicKey,
  decodeBase64Url(parts[2]),
);
if (!signatureOk) throw new Error('GitHub App JWT RSA signature verification failed');

const webhookPayload = Buffer.from(JSON.stringify({ zen: 'Approachable is better than simple.' }));
const digest = createHmac('sha256', webhookSecret).update(webhookPayload).digest('hex');
const header = `sha256=${digest}`;
if (!(await verifyGitHubWebhook(env, new Uint8Array(webhookPayload), header))) {
  throw new Error('Expected valid GitHub webhook signature to verify');
}

const tampered = Buffer.from(JSON.stringify({ zen: 'tampered' }));
if (await verifyGitHubWebhook(env, new Uint8Array(tampered), header)) {
  throw new Error('Tampered GitHub webhook payload unexpectedly verified');
}
if (await verifyGitHubWebhook(env, new Uint8Array(webhookPayload), 'sha256=bad')) {
  throw new Error('Malformed GitHub webhook signature unexpectedly verified');
}

console.log('PASS GitHub App crypto: PKCS#1 -> RS256 JWT + webhook HMAC verification');
