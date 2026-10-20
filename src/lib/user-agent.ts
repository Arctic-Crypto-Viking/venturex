/**
 * A User-Agent string as a person reads it: browser and system ("Safari",
 * "iPhone"). Product names only, so nothing here is translated; the sentence
 * around them ("{browser} on {os}") is in core/src/i18n. Null when unknown.
 *
 * Order matters: Edge, Opera and Samsung Internet also say "Chrome", Chrome
 * also says "Safari", and every iOS browser is Safari underneath with its own
 * marker (CriOS, FxiOS, EdgiOS). Brave says Chrome on purpose.
 */
export type Device = { browser: string | null; os: string | null };

const BROWSERS: Array<[RegExp, string]> = [
  [/EdgiOS|EdgA|Edg\//, "Edge"],
  [/OPR\/|OPiOS|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/FxiOS|Firefox\//, "Firefox"],
  [/CriOS|Chrome\/|Chromium\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/iPad/, "iPad"],
  [/iPhone|iPod/, "iPhone"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

export function describeUserAgent(ua: string | null | undefined): Device {
  if (!ua) return { browser: null, os: null };
  return {
    browser: BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null,
    os: SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null,
  };
}
