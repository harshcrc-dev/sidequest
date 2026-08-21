// ---------------------------------------------------------------------------
// Destination-aware money formatting. Sidequest is global, so amounts are shown
// in the currency of the selected destination where we can determine it,
// instead of assuming Indian Rupees. The "current" currency is set whenever a
// destination is resolved (see App.runCity).
// ---------------------------------------------------------------------------

const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR", US: "USD", GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR",
  IT: "EUR", NL: "EUR", PT: "EUR", GR: "EUR", AT: "EUR", BE: "EUR", FI: "EUR",
  JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD", MY: "MYR", TH: "THB", ID: "IDR",
  PH: "PHP", VN: "VND", KR: "KRW", AE: "AED", SA: "SAR", QA: "QAR", TR: "TRY",
  AU: "AUD", NZ: "NZD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", ZA: "ZAR",
  EG: "EGP", KE: "KES", NG: "NGN", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK",
  PL: "PLN", CZ: "CZK", RU: "RUB", LK: "LKR", NP: "NPR", BD: "BDT", PK: "PKR",
  IL: "ILS", JO: "JOD", LB: "LBP", MA: "MAD", TN: "TND", KW: "KWD", BH: "BHD",
  OM: "OMR", HU: "HUF", RO: "RON", BG: "BGN", HR: "EUR", UA: "UAH", IS: "ISK",
  CO: "COP", CL: "CLP", PE: "PEN", TW: "TWD", KH: "KHR", MM: "MMK",
};

// Sensible default for the offline sample plan (a Bangalore day).
let currentCurrency = "INR";

export function currencyForCountryCode(code?: string): string {
  if (!code) return "USD";
  return COUNTRY_CURRENCY[code.toUpperCase()] ?? "USD";
}

export function setDisplayCurrency(code?: string): void {
  if (code) currentCurrency = currencyForCountryCode(code);
}

export function money(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currentCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currentCurrency} ${Math.round(amount)}`;
  }
}

export function moneyRange(low: number, high: number): string {
  return `${money(low)}-${money(high)}`;
}

// Rough amount of local currency equivalent to 1 USD. Used only to turn the
// offline plan's currency-agnostic base costs (authored in USD magnitudes) into
// believable local amounts; live AI plans always provide their own real prices.
const USD_TO_LOCAL: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CHF: 0.88, CAD: 1.36, AUD: 1.52, NZD: 1.64,
  SEK: 10.6, NOK: 10.8, DKK: 6.9, PLN: 4, CZK: 23, RUB: 92,
  INR: 84, LKR: 300, NPR: 133, BDT: 118, PKR: 278,
  JPY: 150, CNY: 7.2, HKD: 7.8, SGD: 1.35, MYR: 4.7, THB: 36, IDR: 15800,
  PHP: 58, VND: 25000, KRW: 1360,
  AED: 3.67, SAR: 3.75, QAR: 3.64, TRY: 33,
  MXN: 18, BRL: 5.5, ARS: 950, ZAR: 18, EGP: 48, KES: 130, NGN: 1600,
  ILS: 3.7, JOD: 0.71, LBP: 89000, MAD: 10, TND: 3.1, KWD: 0.31, BHD: 0.38,
  OMR: 0.38, HUF: 360, RON: 4.6, BGN: 1.8, UAH: 41, ISK: 138,
  COP: 4000, CLP: 950, PEN: 3.8, TWD: 32, KHR: 4100, MMK: 2100,
};

// Round to a clean, human increment appropriate to the magnitude.
function roundNice(value: number): number {
  if (value <= 0) return 0;
  if (value < 30) return Math.max(1, Math.round(value));
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1000) return Math.round(value / 10) * 10;
  if (value < 10000) return Math.round(value / 50) * 50;
  return Math.round(value / 100) * 100;
}

// Convert a base cost expressed in USD magnitude into a realistic amount in the
// current display currency.
export function localizeAmount(baseUsd: number): number {
  if (!baseUsd) return 0;
  const factor = USD_TO_LOCAL[currentCurrency] ?? 1;
  return roundNice(baseUsd * factor);
}

