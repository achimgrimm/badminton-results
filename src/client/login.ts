/** Pure helpers for the e-mail code login (kept apart from online.ts so they can be tested). */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The trimmed address when it looks like an e-mail address, else null. */
export function cleanEmail(raw: string): string | null {
  const email = raw.trim();
  return EMAIL.test(email) ? email : null;
}

/** The 6 digits of a typed code (spaces and other characters ignored), or null when it is not 6 digits. */
export function cleanCode(raw: string): string | null {
  const code = raw.replace(/\D/g, "");
  return code.length === 6 ? code : null;
}

export type LoginProblem = { text: string; /** Whether asking for a new code helps */ expired: boolean };

/** A clear German message for an error of the code request or check. */
export function loginProblem(error: { code?: string; message?: string; status?: number }): LoginProblem {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "otp_expired" || msg.includes("expired") || msg.includes("invalid")) {
    return { text: "Der Code ist abgelaufen oder wurde schon benutzt. Fordere einen neuen Code an.", expired: true };
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error.status === 429) {
    return { text: "Es wurden zu viele Codes angefordert. Bitte warte kurz und versuche es dann noch einmal.", expired: false };
  }
  if (code === "email_address_invalid" || msg.includes("email address")) {
    return { text: "Diese E-Mail-Adresse wird nicht akzeptiert.", expired: false };
  }
  return { text: "Bitte versuche es später noch einmal.", expired: false };
}
