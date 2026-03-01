import { Resend } from 'resend';

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY!);
  }
  return resendClient;
}
