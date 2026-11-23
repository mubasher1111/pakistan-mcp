// pakistan-mcp: an MCP server that gives AI assistants accurate, tested tools
// for Pakistan: FBR salary tax, CNIC/phone/IBAN/NTN checks, PKR formatting,
// Urdu numbers and dates, and Roman Urdu to Urdu conversion.
//
// Everything runs locally. No API keys, no network calls, no data leaves the machine.

import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import * as pk from 'pakistan-toolkit';
import * as ur from 'urdu-toolkit';

export const VERSION = '1.0.0';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const YEARS = pk.getSupportedYears();

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function fail(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function parseDate(input) {
  if (!input) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  // Treat YYYY-MM-DD as a calendar date, not UTC midnight.
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Creates a new server instance with all tools registered. */
export function createServer() {
  const server = new McpServer(
    { name: 'pakistan-mcp', title: 'Pakistan Tools', version: VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Tools for Pakistan-specific facts and formats. Use calculate_salary_tax for any question about ' +
        'income tax on a salary in Pakistan instead of calculating it yourself. Use the validate_* tools to ' +
        'check CNIC, mobile number, IBAN and NTN formats. Use roman_to_urdu, amount_in_words and urdu_date ' +
        'when the user wants Urdu script output. All tools run locally and are free.',
    },
  );

  // ---------- Income tax ----------
  server.registerTool(
    'calculate_salary_tax',
    {
      title: 'Pakistan salary income tax',
      description:
        `Calculates income tax for a SALARIED individual in Pakistan using the official FBR slabs. ` +
        `Supported fiscal years: ${YEARS.join(', ')} (default: latest, ${pk.LATEST_FISCAL_YEAR}). ` +
        `Give either monthly_income or annual_income in PKR (gross taxable salary). Returns monthly and annual tax, ` +
        `take-home pay, effective and marginal rate, and the surcharge if any. This is an estimate: it does not ` +
        `include exemptions, tax credits or non-salary income.`,
      inputSchema: z.object({
        monthly_income: z.number().nonnegative().optional().describe('Gross monthly taxable salary in PKR'),
        annual_income: z.number().nonnegative().optional().describe('Gross annual taxable salary in PKR'),
        year: z.enum(YEARS).optional().describe(`Fiscal year, e.g. "${pk.LATEST_FISCAL_YEAR}"`),
      }),
      annotations: READ_ONLY,
    },
    async ({ monthly_income, annual_income, year }) => {
      if (monthly_income === undefined && annual_income === undefined) {
        return fail('Provide monthly_income or annual_income.');
      }
      const r = pk.calculateSalaryTax({ monthlyIncome: monthly_income, annualIncome: annual_income, year });
      return ok({
        ...r,
        formatted: {
          monthlyTax: pk.formatPKR(r.monthlyTax),
          annualTax: pk.formatPKR(r.annualTax),
          monthlyTakeHome: pk.formatPKR(r.monthlyTakeHome),
        },
        note: 'Estimate for salaried individuals under FBR slabs; not tax advice.',
      });
    },
  );

  server.registerTool(
    'compare_salary_tax',
    {
      title: 'Compare salary tax between years',
      description:
        `Compares income tax on the same salary across two Pakistani fiscal years (${YEARS.join(', ')}) ` +
        `and returns how much more or less tax is paid.`,
      inputSchema: z.object({
        monthly_income: z.number().nonnegative().optional().describe('Gross monthly taxable salary in PKR'),
        annual_income: z.number().nonnegative().optional().describe('Gross annual taxable salary in PKR'),
        from_year: z.enum(YEARS).optional().describe('Earlier fiscal year (default 2025-26)'),
        to_year: z.enum(YEARS).optional().describe(`Later fiscal year (default ${pk.LATEST_FISCAL_YEAR})`),
      }),
      annotations: READ_ONLY,
    },
    async ({ monthly_income, annual_income, from_year, to_year }) => {
      if (monthly_income === undefined && annual_income === undefined) {
        return fail('Provide monthly_income or annual_income.');
      }
      const c = pk.compareSalaryTax({
        monthlyIncome: monthly_income, annualIncome: annual_income,
        from: from_year ?? '2025-26', to: to_year ?? pk.LATEST_FISCAL_YEAR,
      });
      return ok({
        from: { year: c.from.year, monthlyTax: c.from.monthlyTax, annualTax: c.from.annualTax },
        to: { year: c.to.year, monthlyTax: c.to.monthlyTax, annualTax: c.to.annualTax },
        monthlySaving: c.monthlySaving,
        annualSaving: c.annualSaving,
        summary: c.monthlySaving > 0
          ? `Pays ${pk.formatPKR(c.monthlySaving)} less per month in ${c.to.year} than in ${c.from.year}.`
          : c.monthlySaving < 0
            ? `Pays ${pk.formatPKR(-c.monthlySaving)} more per month in ${c.to.year} than in ${c.from.year}.`
            : 'Same tax in both years.',
      });
    },
  );

  // ---------- Validation ----------
  server.registerTool(
    'validate_cnic',
    {
      title: 'Check a CNIC number',
      description:
        'Checks whether a Pakistani CNIC (13 digits, with or without dashes) has a valid format, and returns the ' +
        'formatted and masked number, the region from the first digit and the gender from the last digit. ' +
        'Checks format only; it does not verify the CNIC with NADRA.',
      inputSchema: z.object({ cnic: z.string().describe('CNIC, e.g. 35202-1234567-3') }),
      annotations: READ_ONLY,
    },
    async ({ cnic }) => {
      const r = pk.parseCNIC(cnic);
      return ok(r.valid ? { ...r, masked: pk.maskCNIC(cnic) } : { valid: false, reason: 'A CNIC must be 13 digits, like 35202-1234567-3, and start with 1-8.' });
    },
  );

  server.registerTool(
    'validate_phone',
    {
      title: 'Check a Pakistani mobile number',
      description:
        'Checks a Pakistani mobile number in any common format (0300..., +92..., 0092...) and returns it in ' +
        'international (E.164), local and WhatsApp formats, plus the network its prefix was originally given to ' +
        '(numbers can be ported to another network).',
      inputSchema: z.object({ phone: z.string().describe('Mobile number, e.g. 0300 1234567') }),
      annotations: READ_ONLY,
    },
    async ({ phone }) => {
      const r = pk.parsePhone(phone);
      return ok(r.valid
        ? { ...r, whatsapp: pk.formatPhone(phone, 'whatsapp'), whatsappLink: `https://wa.me/${pk.formatPhone(phone, 'whatsapp')}` }
        : { valid: false, reason: 'Expected a Pakistani mobile number like 03XX XXXXXXX or +92 3XX XXXXXXX.' });
    },
  );

  server.registerTool(
    'validate_iban',
    {
      title: 'Check a Pakistani IBAN',
      description:
        'Validates a Pakistani IBAN (24 characters starting with PK) with the full ISO mod-97 checksum and ' +
        'identifies the bank (HBL, Meezan, UBL, JazzCash, Easypaisa and more). Spaces and lowercase are fine.',
      inputSchema: z.object({ iban: z.string().describe('IBAN, e.g. PK36 SCBL 0000 0011 2345 6702') }),
      annotations: READ_ONLY,
    },
    async ({ iban }) => {
      const r = pk.parseIBAN(iban);
      return ok(r.valid ? r : { valid: false, reason: 'Not a valid Pakistani IBAN: wrong length, format or checksum.' });
    },
  );

  server.registerTool(
    'validate_ntn',
    {
      title: 'Check an NTN',
      description:
        'Checks the format of a Pakistani National Tax Number: classic 7+1 digits (1234567-8) or a 13-digit CNIC ' +
        'used as NTN. Format only; it does not query FBR.',
      inputSchema: z.object({ ntn: z.string().describe('NTN, e.g. 1234567-8') }),
      annotations: READ_ONLY,
    },
    async ({ ntn }) => {
      const type = pk.getNTNType(ntn);
      return ok(type ? { valid: true, type, formatted: pk.formatNTN(ntn) } : { valid: false });
    },
  );

  // ---------- Money ----------
  server.registerTool(
    'format_pkr',
    {
      title: 'Format an amount in PKR',
      description:
        'Formats a rupee amount the Pakistani way: lakh/crore digit grouping (Rs 12,34,567), a short form ' +
        '("12.35 lakh"), and the amount in words in English and Urdu (cheque style).',
      inputSchema: z.object({
        amount: z.number().nonnegative().max(999_999_999_999).describe('Amount in PKR'),
      }),
      annotations: READ_ONLY,
    },
    async ({ amount }) => ok({
      amount,
      formatted: pk.formatPKR(amount, { decimals: amount % 1 ? 2 : 0 }),
      short: pk.toShortPKR(amount),
      wordsEnglish: pk.amountToWords(amount),
      wordsUrdu: ur.amountToUrduWords(amount, { only: true }),
      urduDigits: ur.formatUrduNumber(amount),
    }),
  );

  // ---------- Urdu ----------
  server.registerTool(
    'roman_to_urdu',
    {
      title: 'Roman Urdu to Urdu script',
      description:
        'Converts Roman Urdu (Urdu typed in English letters, e.g. "aap kaise hain?") into Urdu script. Common ' +
        'words come from a dictionary and are reliable; rare words are converted phonetically and may need ' +
        'correction because Roman Urdu does not show which Urdu letter is meant.',
      inputSchema: z.object({
        text: z.string().max(20000).describe('Roman Urdu text'),
        dictionary: z.record(z.string(), z.string()).optional()
          .describe('Optional extra words, e.g. {"zexcart": "زیکس کارٹ"}'),
      }),
      annotations: READ_ONLY,
    },
    async ({ text, dictionary }) => ok({ urdu: ur.romanToUrdu(text, { dictionary }) }),
  );

  server.registerTool(
    'amount_in_words',
    {
      title: 'Number or amount in words',
      description:
        'Writes a number or rupee amount in words, in English (One Lakh Fifty Thousand...) or Urdu ' +
        '(ایک لاکھ پچاس ہزار...), using the South Asian lakh/crore system.',
      inputSchema: z.object({
        value: z.number().nonnegative().max(999_999_999_999).describe('The number or amount'),
        language: z.enum(['english', 'urdu', 'both']).optional().describe('Default: both'),
        kind: z.enum(['amount', 'number']).optional().describe('"amount" adds Rupees/Paisa (default), "number" is plain'),
      }),
      annotations: READ_ONLY,
    },
    async ({ value, language = 'both', kind = 'amount' }) => {
      const out = {};
      if (language !== 'urdu') out.english = kind === 'amount' ? pk.amountToWords(value) : pk.numberToWords(value);
      if (language !== 'english') out.urdu = kind === 'amount' ? ur.amountToUrduWords(value) : ur.numberToUrduWords(value);
      return ok(out);
    },
  );

  server.registerTool(
    'urdu_date',
    {
      title: 'Date in Urdu and Hijri',
      description:
        'Returns a date in Urdu (e.g. منگل، ۲۴ نومبر ۲۰۲۶) and its Islamic Hijri date with Urdu month names. ' +
        'Hijri uses the Umm al-Qura calendar; Pakistan follows local moon sighting, so the official date can ' +
        'differ by one day. Defaults to today.',
      inputSchema: z.object({
        date: z.string().optional().describe('Date as YYYY-MM-DD (default: today)'),
        digits: z.enum(['urdu', 'english']).optional().describe('Digit style (default urdu)'),
      }),
      annotations: READ_ONLY,
    },
    async ({ date, digits = 'urdu' }) => {
      const d = parseDate(date);
      if (!d) return fail(`Invalid date "${date}". Use YYYY-MM-DD.`);
      const h = ur.getHijriDate(d);
      return ok({
        gregorianUrdu: ur.formatUrduDate(d, { digits }),
        hijriUrdu: ur.formatHijriDate(d, { digits }),
        hijri: h,
        note: 'Hijri date by Umm al-Qura; Pakistan’s moon-sighting date may differ by one day.',
      });
    },
  );

  // ---------- Reference data ----------
  server.registerTool(
    'list_cities',
    {
      title: 'Pakistani provinces and cities',
      description:
        'Lists Pakistan’s provinces and territories (with ISO codes and Urdu names), or the major cities of one ' +
        'province (with Urdu names).',
      inputSchema: z.object({
        province: z.string().optional().describe('Province name or ISO code, e.g. "Sindh" or "PK-PB". Omit to list provinces.'),
      }),
      annotations: READ_ONLY,
    },
    async ({ province }) => {
      if (!province) return ok({ provinces: pk.provinces });
      const cities = pk.getCitiesByProvince(province);
      if (!cities.length) return fail(`Unknown province "${province}". Valid: ${pk.provinces.map((p) => p.name).join(', ')}`);
      return ok({ province, cities });
    },
  );

  server.registerTool(
    'find_bank',
    {
      title: 'Find a Pakistani bank',
      description:
        'Looks up a Pakistani bank by its 4-letter IBAN code (e.g. MEZN) or short name (e.g. HBL, Meezan, ' +
        'JazzCash). Omit the query to list all supported banks.',
      inputSchema: z.object({ query: z.string().optional().describe('IBAN bank code or short name') }),
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      if (!query) return ok({ banks: pk.banks });
      const bank = pk.findBank(query);
      return bank ? ok(bank) : fail(`No bank found for "${query}".`);
    },
  );

  return server;
}
