import type { Metadata } from 'next';
import LegalDocumentClient from '../components/LegalDocumentClient';
import { TERMS } from '../legal-copy';

export const metadata: Metadata = {
  title: 'Terms of Service — PicoSvc',
  description: 'PicoSvc Terms of Service. English, Japanese, and Simplified Chinese are available in the page language selector.',
};

export default function TermsPage() {
  return <LegalDocumentClient documents={TERMS} />;
}
