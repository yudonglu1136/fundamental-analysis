import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const cjk = /[\u3400-\u9fff]/;

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function checkFlutterLiteralGuards() {
  const file = path.join(root, 'lib/main.dart');
  const source = fs.readFileSync(file, 'utf8');
  const guards = [
    ['tooltip literal', /tooltip:\s*(['"])/g],
    ['hintText literal', /hintText:\s*(['"])/g],
    ['labelText literal', /labelText:\s*(['"])/g],
    ['semanticLabel literal', /semanticLabel:\s*(['"])/g],
  ];
  for (const [name, pattern] of guards) {
    for (const match of source.matchAll(pattern)) {
      failures.push(`lib/main.dart:${lineNumber(source, match.index)} ${name}`);
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
      `lib/main.dart:${lineNumber(source, match.index)} direct Text literal`,
    );
  }
}

function loadOntologyI18n() {
  const warnings = [];
  const context = {
    URL,
    URLSearchParams,
    console: {
      log() {},
      info() {},
      error() {},
      warn(...args) {
        warnings.push(args.join(' '));
      },
    },
    location: { search: '?lang=en' },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(root, 'web/ontology/i18n.js'), 'utf8'),
    context,
    { filename: 'web/ontology/i18n.js' },
  );
  return { api: context.OntologyI18n, warnings };
}

function checkOntologyCoverage() {
  const { api, warnings } = loadOntologyI18n();
  if (!api) {
    failures.push('web/ontology/i18n.js did not expose OntologyI18n');
    return;
  }
  api.setLanguage('en', { updateUrl: false });
  for (const relative of ['web/ontology/index.html', 'web/ontology/app.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    source.split('\n').forEach((line, index) => {
      if (!cjk.test(line)) return;
      const warningStart = warnings.length;
      const translated = api.translateString(line);
      if (warnings.length > warningStart || cjk.test(translated)) {
        failures.push(`${relative}:${index + 1} missing English translation`);
      }
    });
  }

  const dynamicEnglishSamples = [
    '2026-08-06 · 半导体与电子元件',
    'NVDA · 收入同比 +70.7% · GPU、网络、CUDA软件和整机参考架构构成全栈AI计算平台。',
    '活跃美国上市普通股、ADR 与加拿大跨境普通股，不含 ETF、基金、优先股和权证。',
    '保留 V2 的入选资格和排序，用质量持续性、最新季度反转及真实同行确认动态调整仓位与风险标签。',
    'V2 排名入选；置信度 high；风险标签 none；软覆盖倍率 1.13x',
    'TTM营业利润同比增长 97.1%，快于多数图谱公司。',
    'TTM资本开支同比增长 250.0%，可能是需求前置投入，也可能压低近期FCF。',
  ];
  for (const sample of dynamicEnglishSamples) {
    const warningStart = warnings.length;
    const translated = api.translateString(sample);
    if (
      warnings.length > warningStart ||
      cjk.test(translated) ||
      translated.includes('translation unavailable')
    ) {
      failures.push(`web/ontology/i18n.js missing dynamic English translation for ${sample}`);
    }
  }

  const chineseOnlyLabels = [
    'Fundamental Signal Graph',
    'STRATEGY RESEARCH',
    'MARK-TO-MARKET',
    'TRADE OUTCOMES',
    'PORTFOLIO REPLAY',
    'EVENT ONTOLOGY V2',
    'SIGNAL COCKPIT',
    'DECISION BOARD',
    'US LISTED EQUITIES',
    'MARKET UNIVERSE',
    'Ontology Intelligence',
    'Integrated with ML',
    'Profit factor',
    'Sharpe',
    'Microsoft FY2026 Q2 Earnings Call',
    'Capex',
    'Capex同比',
    'Capex激增',
    'industry-structure关系描述产业位置，不等于已披露客户合同或收入占比。',
    'Technology',
    'Consumer Cyclical',
    'Semiconductors',
    'Software - Infrastructure',
    'Domestic Common Stock',
    'BUY PBF',
    'SELL ALGM',
  ];
  api.setLanguage('zh', { updateUrl: false });
  for (const label of chineseOnlyLabels) {
    if (!cjk.test(api.translateString(label))) {
      failures.push(`web/ontology/i18n.js missing Chinese translation for ${label}`);
    }
  }

  const translatedRisk = api.translateString(
    'V2 排名入选；置信度 standard；风险标签 peer_unconfirmed；软覆盖倍率 1.18x',
  );
  if (/standard|peer_unconfirmed|\b1\.18x\b/.test(translatedRisk)) {
    failures.push('web/ontology/i18n.js leaves dynamic confidence/risk codes untranslated');
  }
  const translatedTradeReason = api.translateString(
    '2026-08-03 · 561 股 · new_or_refill',
  );
  if (translatedTradeReason.includes('new_or_refill')) {
    failures.push('web/ontology/i18n.js leaves dynamic trade reasons untranslated');
  }
  const companyName = 'COMPASS DIVERSIFIED HOLDINGS';
  if (api.translateString(companyName) !== companyName) {
    failures.push('web/ontology/i18n.js corrupts legal company names during reverse translation');
  }
}

checkFlutterLiteralGuards();
checkOntologyCoverage();

if (failures.length > 0) {
  console.error('Bilingual coverage audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Bilingual coverage audit passed: Flutter literal guards and bidirectional Ontology coverage are complete.');
}
