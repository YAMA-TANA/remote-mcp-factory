import assert from 'node:assert/strict';
import { parseMimeMessage, decodeMimeHeader } from '../src/picosvc/mail-mime.ts';

const fixture = `From: sender@example.com\r\nSubject: =?UTF-8?B?44OG44K544OI?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="outer"\r\n\r\n--outer\r\nContent-Type: multipart/alternative; boundary="inner"\r\n\r\n--inner\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello=20World\r\n--inner\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\nPHA+SGVsbG88L3A+\r\n--inner--\r\n--outer\r\nContent-Type: text/plain; name="test.txt"\r\nContent-Disposition: attachment; filename="test.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\nYXR0YWNobWVudA==\r\n--outer--\r\n`;
const parsed = parseMimeMessage(new TextEncoder().encode(fixture));
assert.equal(parsed.text?.trim(), 'Hello World');
assert.equal(parsed.html?.trim(), '<p>Hello</p>');
assert.equal(parsed.attachments.length, 1);
assert.equal(parsed.attachments[0].filename, 'test.txt');
assert.equal(new TextDecoder().decode(parsed.attachments[0].data), 'attachment');
assert.equal(parsed.omittedAttachments, 0);
assert.equal(decodeMimeHeader('=?UTF-8?B?44OG44K544OI?='), 'テスト');
const oversized = `Content-Type: application/octet-stream\nContent-Disposition: attachment; filename="oversize.bin"\nContent-Transfer-Encoding: base64\n\n${btoa('a'.repeat(256 * 1024 + 1))}`;
const rejected = parseMimeMessage(new TextEncoder().encode(oversized));
assert.equal(rejected.attachments.length, 0);
assert.equal(rejected.omittedAttachments, 1);
console.log('PicoSvc Mail MIME OK: nested multipart, text/HTML, attachment, header, size cap.');
