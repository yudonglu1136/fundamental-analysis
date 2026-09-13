import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function checkFlutterLiteralGuards() {
  for (const relative of ['lib/main.dart', 'lib/stock_research.dart']) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  const guards = [
    ['tooltip literal', /tooltip:\s*(['"])/g],
    ['hintText literal', /hintText:\s*(['"])/g],
    ['labelText literal', /labelText:\s*(['"])/g],
    ['semanticLabel literal', /semanticLabel:\s*(['"])/g],
  ];
  for (const [name, pattern] of guards) {
    for (const match of source.matchAll(pattern)) {
      failures.push(`${relative}:${lineNumber(source, match.index)} ${name}`);
    }
  }

  const permittedDirectText = [
    /'GI'/,
    /'Guru Intelligence'/,
    /disclosureLabel\(/,
    /\$selectedStart - \$selectedEnd/,
    /context\.ui\(label\)/,
    /actionLabel\(/,
    /\$\{page \+ 1\}\/\$count/,
    /'#\$rank'/,
    /context\.tr\(/,
    /\$gapText \u00b7 \$fairText/,
    /'1Y \$\{formatNullableReturn/,
    /\$priceText \u00b7 \$fairText/,
    /formatNullableReturn\(row\['trailingReturn'\]\).*annualVolatility/s,
    /formatDividendMoney\(/,
    /'\$day'/,
    /event\.ticker.*compactName/s,
    /'\$\{date\.day\}'/,
    /account\['provider'\].*context\.ui/s,
    /_stateLabel\(.*context\.ui/s,
    /context_position_multiplier.*toStringAsFixed/s,
    /signals\.length.*formatDate/s,
    /'SPY'/,
    /entry_date.*cost_basis.*current_price/s,
    /group\.rows\.length/,
    /confidence \* 100/,
    /'\$count'/,
  ];
  for (const match of source.matchAll(/\bText\(\s*(['"])/g)) {
    const snippet = source.slice(match.index, match.index + 700);
    if (permittedDirectText.some((pattern) => pattern.test(snippet))) continue;
    failures.push(
      `${relative}:${lineNumber(source, match.index)} direct Text literal`,
    );
  }
  }
}

checkFlutterLiteralGuards();

if (failures.length > 0) {
  console.error('Bilingual coverage audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Bilingual literal audit passed: Flutter shared UI literal guards are satisfied.');
}
