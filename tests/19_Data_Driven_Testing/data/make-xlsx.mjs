// Creates data/users.xlsx with two sheets. Run once: node tests/19_Data_Driven_Testing/data/make-xlsx.mjs
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
  { email: 'asha@example.com', password: 'secret', expected: 'Welcome, asha@example.com' },
  { email: 'asha@example.com', password: 'wrong', expected: 'Invalid credentials' },
  { email: 'priya@example.com', password: 'secret', expected: 'Welcome, priya@example.com' },
]), 'Logins');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
  { name: 'Laptop', price: 900 }, { name: 'Phone', price: 500 }, { name: 'Headphones', price: 100 },
]), 'Products');
XLSX.writeFile(wb, path.join(here, 'users.xlsx'));
console.log('users.xlsx written');
