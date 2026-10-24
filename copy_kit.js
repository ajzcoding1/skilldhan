const fs = require('fs');
const path = require('path');

const src = 'C:\\Users\\lamga\\Downloads\\AI_Digital_Business_Launch_Kit_Premium';
const dst = 'C:\\Users\\lamga\\Desktop\\mydigitalstore\\downloads';
const pdfSrc = path.join(src, 'PDF');

fs.mkdirSync(path.join(dst, 'full_kit'), { recursive: true });

const copies = [
  // Main files (for single-product download endpoints)
  [path.join(pdfSrc, '01_Premium_Playbook.pdf'),           path.join(dst, 'AI-Digital-Business-Guide.pdf')],
  [path.join(pdfSrc, '03_100_Premium_AI_Prompts.pdf'),     path.join(dst, '100-AI-Prompts-Vault.pdf')],
  // Full kit (all 5 PDFs + Excel for complete bundle download)
  [path.join(pdfSrc, '01_Premium_Playbook.pdf'),           path.join(dst, 'full_kit', '01_Premium_Playbook.pdf')],
  [path.join(pdfSrc, '02_Implementation_Workbook.pdf'),    path.join(dst, 'full_kit', '02_Implementation_Workbook.pdf')],
  [path.join(pdfSrc, '03_100_Premium_AI_Prompts.pdf'),     path.join(dst, 'full_kit', '03_100_Premium_AI_Prompts.pdf')],
  [path.join(pdfSrc, '04_Premium_Landing_Page_Copy.pdf'),  path.join(dst, 'full_kit', '04_Premium_Landing_Page_Copy.pdf')],
  [path.join(pdfSrc, '05_30_Day_Premium_Roadmap.pdf'),     path.join(dst, 'full_kit', '05_30_Day_Premium_Roadmap.pdf')],
  [path.join(src, '06_Premium_Pricing_Profit_Calculator.xlsx'), path.join(dst, 'full_kit', '06_Pricing_Profit_Calculator.xlsx')],
];

let ok = 0, fail = 0;
copies.forEach(([from, to]) => {
  try {
    fs.copyFileSync(from, to);
    const size = Math.round(fs.statSync(to).size / 1024);
    console.log('  OK  ' + path.basename(to) + ' (' + size + ' KB)');
    ok++;
  } catch(e) {
    console.error('  FAIL ' + path.basename(to) + ': ' + e.message);
    fail++;
  }
});

console.log('\nResult: ' + ok + ' copied, ' + fail + ' failed');
