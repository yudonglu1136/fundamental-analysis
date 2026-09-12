import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const array=x=>x==null?[]:Array.isArray(x)?x:[x];
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:false});
const ids=new Set(['33ebc900d50cf6d3a1d43827','6bbbc785e0418ace65435f82','d6e609bbda362b97c6e51b39']);
const names=['Assets','RevenueFromContractWithCustomerIncludingAssessedTax','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations','EarningsPerShareDiluted'];

/** Original parent consolidated statement proof; no subsidiary dimensions,
 * later takeover issuer or unreviewed event can use this finite contract.
 * The source applier additionally matches every fact to the original filed
 * inline HTML, and the reviewed registry binds original statement hashes.
 */
export function auditAvavStatementCurrency({ticker,sourceId,observedAt,proof:p,reviewed}) {
  const fail=s=>'avav_original_parent_'+s;
  try {
    if(ticker!=='AVAV'||!ids.has(sourceId)||observedAt!=='2021-06-22'||p.cik!=='0001368622'||p.availableAt!=='2020-06-24'||p.form!=='10-K'||p.accession!=='0001558370-20-007720'||p.inference!==false||p.quotes?.length!==1||p.quotes[0]!=='AEROVIRONMENT, INC.')return fail('identity_date_or_caption_mismatch');
    const prefix='https://www.sec.gov/Archives/edgar/data/1368622/000155837020007720/';
    const xml=p.xbrlStatementEvidence,expected=reviewed?.xbrlStatementEvidence;
    if(p.sourceUrl!==prefix+'avav-20200623x10k.htm'||!xml||!expected||!['sourceUrl','documentSha256','schemaVersion','periodEnd','rootOpenTagSha256','contextScope'].every(k=>xml[k]===expected[k])||xml.schemaVersion!=='avav-original-parent-statement-currency-v1'||xml.periodEnd!=='2020-04-30'||xml.contextScope!=='whole_entity_no_dimensions'||xml.sourceUrl!==prefix+'avav-20200623x10k_htm.xml')return fail('original_binding_mismatch');
    if(hash(xml.rootOpenTag)!==xml.rootOpenTagSha256||!/xmlns(?::xbrli)?="http:\/\/www\.xbrl\.org\/2003\/instance"/.test(xml.rootOpenTag)||!/xmlns:us-gaap="http:\/\/fasb\.org\/us-gaap\/\d{4}-\d{2}-\d{2}"/.test(xml.rootOpenTag)||!/xmlns:iso4217="http:\/\/www\.xbrl\.org\/2003\/iso4217"/.test(xml.rootOpenTag))return fail('namespace_mismatch');
    if(!Array.isArray(xml.fragments)||xml.fragments.length!==8||new Set(xml.fragments.map(f=>f.key)).size!==8||xml.fragments.some((f,i)=>hash(f.raw)!==xml.fragmentsSha256?.[i]||hash(f.raw)!==expected.fragmentsSha256?.[i]))return fail('fragment_hash_mismatch');
    if(xml.fragments.some(f=>/\bxmlns(?::\w+)?\s*=/.test(f.raw))||names.some(name=>!xml.fragments.some(f=>f.key==='fact:'+name&&new RegExp(`^<us-gaap:${name}\\b[^>]*>[^<]+</us-gaap:${name}>$`).test(f.raw))))return fail('fragment_namespace_scope_mismatch');
    const root=parser.parse(xml.rootOpenTag+xml.fragments.map(f=>f.raw).join('')+xml.rootCloseTag).xbrl;
    const contexts=new Map(array(root.context).map(c=>[c['@_id'],c]));const units=new Map(array(root.unit).map(u=>[u['@_id'],u]));
    if(contexts.size!==2||units.size!==2)return fail('missing_parent_contexts_or_units');
    const decoded=[];
    for(const name of names) {
      const facts=array(root[name]);if(facts.length!==1)return fail('duplicate_or_missing_statement_fact');
      const f=facts[0],c=contexts.get(f['@_contextRef']),u=units.get(f['@_unitRef']);
      if(!c||!u||c.entity?.identifier?.['#text']!=='0001368622'||c.entity.identifier['@_scheme']!=='http://www.sec.gov/CIK'||c.entity.segment!==undefined||c.scenario!==undefined)return fail('not_parent_no_dimensions');
      if(!/^-?\d+(?:\.\d+)?$/.test(f['#text']))return fail('nonnumeric_fact');
      if(name==='Assets'?c.period?.instant!=='2020-04-30':c.period?.startDate!=='2019-05-01'||c.period?.endDate!=='2020-04-30')return fail('statement_period_mismatch');
      if(name==='EarningsPerShareDiluted') {
        if(u.divide?.unitNumerator?.measure!=='iso4217:USD'||!['shares','xbrli:shares'].includes(u.divide?.unitDenominator?.measure))return fail('eps_not_usd_per_share');
      }else if(u.measure!=='iso4217:USD'||u.divide!==undefined)return fail('monetary_fact_not_usd');
      decoded.push({concept:name,value:f['#text'],contextRef:f['@_contextRef'],unitRef:f['@_unitRef']});
    }
    if(JSON.stringify(decoded)!==JSON.stringify(xml.reconstructedFacts))return fail('fact_reconstruction_mismatch');
    const h=p.filingDateEvidence,e=reviewed?.filingDateEvidence;
    if(!h||!e||!['sourceUrl','documentSha256','headerTextSha256'].every(k=>h[k]===e[k])||hash(h.headerText)!==h.headerTextSha256||h.sourceUrl!==prefix+p.accession+'-index.html')return fail('filed_header_binding_mismatch');
    if(h.headerText.match(/Filing Date (\d{4}-\d{2}-\d{2})/)?.[1]!=='2020-06-24'||!/CIK\s*:\s*0001368622\b/.test(h.headerText)||!h.headerText.includes(p.accession)||!h.headerText.includes('Form 10-K'))return fail('filed_header_semantics_mismatch');
    return null;
  }catch{return fail('invalid_proof');}
}
