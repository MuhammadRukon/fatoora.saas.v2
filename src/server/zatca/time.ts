// Single source of ZATCA timestamps: IssueDate/IssueTime (BR-KSA-70, UTC form hh:mm:ssZ) and
// QR tag 3 (ISO 8601) are the same instant, so the QR never disagrees with the XML.
export function toZatcaDateTime(date: Date) {
  const iso = date.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ, always UTC
  const issueDate = iso.slice(0, 10);
  const time = iso.slice(11, 19);
  return { issueDate, issueTime: `${time}Z`, qrTimestamp: `${issueDate}T${time}Z` };
}

// Display only (print view). Saudi Arabia has no DST, so a fixed +3h is exact.
export function riyadhDisplay(date: Date): string {
  return new Date(date.getTime() + 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}
