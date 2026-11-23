// End-to-end test: starts the real CLI over stdio, exactly like Claude Desktop
// does, and calls every tool through an MCP client.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const BIN = fileURLToPath(new URL('../bin/pakistan-mcp.js', import.meta.url));
let client;

before(async () => {
  client = new Client({ name: 'pakistan-mcp-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN] }));
});

after(async () => {
  await client?.close();
});

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return res;
}

test('lists all tools with read-only annotations', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'amount_in_words', 'calculate_salary_tax', 'compare_salary_tax', 'find_bank', 'format_pkr',
    'list_cities', 'roman_to_urdu', 'urdu_date', 'validate_cnic', 'validate_iban', 'validate_ntn', 'validate_phone',
  ]);
  for (const t of tools) {
    assert.ok(t.description.length > 40, `${t.name} needs a description`);
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name} should be read-only`);
    assert.equal(t.inputSchema.type, 'object');
  }
});

test('calculate_salary_tax', async () => {
  const r = await call('calculate_salary_tax', { monthly_income: 200000 });
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.monthlyTax, 13000);
  assert.equal(r.structuredContent.year, '2026-27');
  assert.equal(r.structuredContent.formatted.monthlyTakeHome, 'Rs 1,87,000');
  assert.match(r.content[0].text, /"monthlyTax": 13000/);

  const old = await call('calculate_salary_tax', { annual_income: 12_000_000, year: '2025-26' });
  assert.equal(old.structuredContent.surcharge, 304290);

  const missing = await call('calculate_salary_tax', {});
  assert.equal(missing.isError, true);
});

test('calculate_salary_tax rejects bad input', async () => {
  const r = await call('calculate_salary_tax', { monthly_income: -5 });
  assert.equal(r.isError, true);
  const y = await call('calculate_salary_tax', { monthly_income: 100, year: '1999-00' });
  assert.equal(y.isError, true);
});

test('compare_salary_tax', async () => {
  const r = await call('compare_salary_tax', { monthly_income: 300000 });
  assert.equal(r.structuredContent.annualSaving, 50000);
  assert.match(r.structuredContent.summary, /less per month in 2026-27/);
});

test('validators', async () => {
  const cnic = await call('validate_cnic', { cnic: '42101-1234567-8' });
  assert.equal(cnic.structuredContent.region, 'Sindh');
  assert.equal(cnic.structuredContent.masked, '42101-*******-8');
  assert.equal((await call('validate_cnic', { cnic: '123' })).structuredContent.valid, false);

  const phone = await call('validate_phone', { phone: '0345 1234567' });
  assert.equal(phone.structuredContent.e164, '+923451234567');
  assert.equal(phone.structuredContent.whatsappLink, 'https://wa.me/923451234567');

  const iban = await call('validate_iban', { iban: 'PK36 SCBL 0000 0011 2345 6702' });
  assert.equal(iban.structuredContent.bank.short, 'SCB');
  assert.equal((await call('validate_iban', { iban: 'PK36SCBL0000001123456703' })).structuredContent.valid, false);

  const ntn = await call('validate_ntn', { ntn: '12345678' });
  assert.deepEqual(ntn.structuredContent, { valid: true, type: 'ntn', formatted: '1234567-8' });
});

test('format_pkr and amount_in_words', async () => {
  const f = await call('format_pkr', { amount: 2500000 });
  assert.equal(f.structuredContent.formatted, 'Rs 25,00,000');
  assert.equal(f.structuredContent.short, '25 lakh');
  assert.equal(f.structuredContent.wordsUrdu, 'پچیس لاکھ روپے صرف');

  const w = await call('amount_in_words', { value: 150250.5 });
  assert.equal(w.structuredContent.english, 'One Lakh Fifty Thousand Two Hundred Fifty Rupees and Fifty Paisa Only');
  assert.equal(w.structuredContent.urdu, 'ایک لاکھ پچاس ہزار دو سو پچاس روپے اور پچاس پیسے');

  const n = await call('amount_in_words', { value: 49, language: 'urdu', kind: 'number' });
  assert.deepEqual(n.structuredContent, { urdu: 'انچاس' });
});

test('roman_to_urdu', async () => {
  const r = await call('roman_to_urdu', { text: 'aap kaise hain?' });
  assert.equal(r.structuredContent.urdu, 'آپ کیسے ہیں؟');
  const d = await call('roman_to_urdu', { text: 'zexcart', dictionary: { zexcart: 'زیکس کارٹ' } });
  assert.equal(d.structuredContent.urdu, 'زیکس کارٹ');
});

test('urdu_date', async () => {
  const r = await call('urdu_date', { date: '2026-02-18' });
  assert.equal(r.structuredContent.gregorianUrdu, 'بدھ، ۱۸ فروری ۲۰۲۶');
  assert.equal(r.structuredContent.hijriUrdu, '۱ رمضان ۱۴۴۷ ہجری');
  assert.equal(r.structuredContent.hijri.monthName, 'رمضان');
  assert.equal((await call('urdu_date', { date: 'yesterday-ish' })).isError, true);
  assert.equal((await call('urdu_date')).isError, undefined);
});

test('list_cities and find_bank', async () => {
  const p = await call('list_cities');
  assert.equal(p.structuredContent.provinces.length, 7);
  const c = await call('list_cities', { province: 'Sindh' });
  assert.ok(c.structuredContent.cities.some((x) => x.name === 'Karachi'));
  assert.equal((await call('list_cities', { province: 'Narnia' })).isError, true);

  assert.equal((await call('find_bank', { query: 'hbl' })).structuredContent.code, 'HABB');
  assert.ok((await call('find_bank')).structuredContent.banks.length >= 26);
  assert.equal((await call('find_bank', { query: 'nope' })).isError, true);
});
