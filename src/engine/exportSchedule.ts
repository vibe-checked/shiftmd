// PDF generation + delivery (email / share sheet) for a schedule.

import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Physician, Schedule } from '../types';
import { fromISO } from './dates';
import { buildScheduleHtml } from './scheduleHtml';

function rangeLabel(s: Schedule): string {
  const f = (iso: string) => fromISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${f(s.startDate)} – ${f(s.endDate)}`;
}

/** Render the schedule to a PDF file and return its local URI. */
export async function makeSchedulePdf(
  schedule: Schedule,
  physicians: Physician[],
): Promise<string> {
  const html = buildScheduleHtml(schedule, physicians);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export interface DeliverResult {
  status: 'sent' | 'shared' | 'cancelled' | 'unavailable';
}

/** Validates an email address loosely (enough to skip obvious junk). */
function isEmail(s?: string): s is string {
  return !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

export function recipientEmails(physicians: Physician[]): string[] {
  return physicians.map((p) => p.email).filter(isEmail).map((e) => e.trim());
}

/** Open the Mail composer with the PDF attached and physicians pre-filled. */
export async function emailSchedule(
  pdfUri: string,
  schedule: Schedule,
  physicians: Physician[],
): Promise<DeliverResult> {
  const available = await MailComposer.isAvailableAsync();
  if (!available) return { status: 'unavailable' };
  const range = rangeLabel(schedule);
  const result = await MailComposer.composeAsync({
    recipients: recipientEmails(physicians),
    subject: `Shift Schedule — ${range}`,
    body:
      `Hi all,\n\nAttached is the shift schedule for ${range}. ` +
      `Please review your assignments and flag any conflicts.\n\nThanks`,
    attachments: [pdfUri],
  });
  // result.status: 'sent' | 'saved' | 'cancelled' | 'undetermined'
  return { status: result.status === 'sent' ? 'sent' : 'cancelled' };
}

/** Open the system share sheet (Mail, Messages, AirDrop, Files…). */
export async function shareSchedulePdf(pdfUri: string): Promise<DeliverResult> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return { status: 'unavailable' };
  await Sharing.shareAsync(pdfUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share call schedule',
  });
  return { status: 'shared' };
}
