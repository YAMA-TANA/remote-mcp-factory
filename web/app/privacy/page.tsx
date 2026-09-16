import type { Metadata } from 'next';
import LegalDocumentClient from '../components/LegalDocumentClient';
import { PRIVACY } from '../legal-copy';

export const metadata: Metadata = {
  title: 'Privacy Policy — PicoSvc',
  description: 'PicoSvc Privacy Policy. English, Japanese, and Simplified Chinese are available in the page language selector.',
};

export default function PrivacyPage() {
  return <LegalDocumentClient documents={PRIVACY} />;
}
