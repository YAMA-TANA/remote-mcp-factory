'use client';

import { useState } from 'react';
import type { Locale } from '../i18n-data';

const COPY = {
  en: {
    title: 'Try a mock response',
    description: 'This browser-only preview does not create a resource or send your input anywhere.',
    status: 'HTTP status',
    body: 'JSON response body',
    preview: 'Preview response',
    result: 'Response preview',
    invalid: 'Enter valid JSON to preview the response.',
    statuses: ['200 OK', '201 Created', '404 Not Found', '500 Server Error'],
  },
  ja: {
    title: 'モックレスポンスを試す',
    description: 'ブラウザー内だけのプレビューです。リソースは作成されず、入力内容も送信されません。',
    status: 'HTTPステータス',
    body: 'JSONレスポンス本文',
    preview: 'レスポンスをプレビュー',
    result: 'レスポンスのプレビュー',
    invalid: '有効なJSONを入力してください。',
    statuses: ['200 成功', '201 作成済み', '404 見つかりません', '500 サーバーエラー'],
  },
  'zh-CN': {
    title: '试用模拟响应',
    description: '此预览仅在浏览器中运行，不会创建资源或发送你输入的内容。',
    status: 'HTTP 状态码',
    body: 'JSON 响应正文',
    preview: '预览响应',
    result: '响应预览',
    invalid: '请输入有效的 JSON。',
    statuses: ['200 成功', '201 已创建', '404 未找到', '500 服务器错误'],
  },
} as const;

export default function MockPreviewDemo({ locale }: { locale: Locale }) {
  const t = COPY[locale];
  const [status, setStatus] = useState('200');
  const [body, setBody] = useState(JSON.stringify({ ok: true, message: 'Hello from Mock API' }, null, 2));
  const [result, setResult] = useState('');
  const [error, setError] = useState(false);

  function preview() {
    try {
      const parsed = JSON.parse(body);
      setResult(JSON.stringify({ status: Number(status), body: parsed }, null, 2));
      setError(false);
    } catch {
      setResult('');
      setError(true);
    }
  }

  return (
    <section className="mockPreviewDemo" id="mock-demo" aria-labelledby="mock-demo-title">
      <h2 id="mock-demo-title">{t.title}</h2>
      <p>{t.description}</p>
      <label htmlFor="mock-demo-status">{t.status}</label>
      <select id="mock-demo-status" value={status} onChange={(event) => setStatus(event.target.value)}>
        {['200', '201', '404', '500'].map((code, index) => <option key={code} value={code}>{t.statuses[index]}</option>)}
      </select>
      <label htmlFor="mock-demo-body">{t.body}</label>
      <textarea id="mock-demo-body" rows={7} spellCheck={false} value={body} onChange={(event) => setBody(event.target.value)} />
      <button className="customerDemoButton" type="button" onClick={preview}>{t.preview}</button>
      {error && <p className="mockPreviewError" role="alert">{t.invalid}</p>}
      {result && <div className="mockPreviewResult" aria-live="polite"><h3>{t.result}</h3><pre>{result}</pre></div>}
    </section>
  );
}
