import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact & Support — PicoSvc',
  description: 'Contact PicoSvc support. English, Japanese, and Simplified Chinese are available.',
};

export default function ContactPage() {
  return <ContactClient />;
}
