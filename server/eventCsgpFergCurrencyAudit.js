import crypto from 'node:crypto';

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const ISSUERS = {
  APA: {
    cik: '0000006769', availableAt: '2020-02-28', accession: '0001733037-20-000004', name: 'apa10-k2019.htm',
    declaration: 'Our financial statements, presented in U.S. dollars, may be affected by foreign currency fluctuations through both translation risk and transaction risk.',
    owner: 'APACHE CORPORATION AND SUBSIDIARIES STATEMENT OF CONSOLIDATED OPERATIONS',
    events: {'e4fb30013be479d6b5c12e56':'2020-11-05'},
  },
  CSGP: {
    cik: '0001057352', availableAt: '2011-02-25', accession: '0001057352-11-000012', name: 'form_10-k.htm',
    declaration: 'Our financial reporting currency is the U.S. dollar.',
    owner: 'COSTAR GROUP, INC. CONSOLIDATED STATEMENTS OF OPERATIONS',
    events: {'0add1d1207ac42ab57741994':'2011-04-27','108d93324ecc6a14a270bf4f':'2011-04-27','f4581e02e80dce16605d1249':'2011-04-27'},
  },
  FERG: {
    cik: '0001832433', availableAt: '2023-09-26', accession: '0001832433-23-000066', name: 'ferg-20230731.htm',
    declaration: 'The consolidated financial statements are presented in U.S. dollars.',
    owner: 'Ferguson plc Consolidated Statements of Earnings',
    events: {'deea2ad2293cb843d4e728f7':'2023-12-05','a57c4fe870a40a591ab7a8ee':'2024-03-05','6e659971614e5ed096f8eb36':'2023-09-26'},
  },
};

/** Read the exact reporting declaration and original indexed availability.
 * The outer auditor independently binds complete-file/paragraph hashes and
 * event IDs through the reviewed registry. Neither sales currency nor a later
 * re-domiciled company's statement is permitted to substitute for these facts.
 */
export function auditCsgpFergCurrency({ticker,sourceId,observedAt,proof:p,reviewed}) {
  const spec=ISSUERS[ticker];
  if (!spec || spec.events[sourceId]!==observedAt || p.form!=='10-K' || p.inference!==false ||
      !['cik','availableAt','accession'].every(k=>p[k]===spec[k]) ||
      p.quotes?.length!==2 || p.quotes[0]!==spec.declaration || p.quotes[1]!==spec.owner) return 'csgp_ferg_original_declaration_or_owner_mismatch';
  const prefix=`https://www.sec.gov/Archives/edgar/data/${Number(spec.cik)}/${spec.accession.replaceAll('-','')}/`;
  const header=p.filingDateEvidence,expected=reviewed?.filingDateEvidence;
  if(p.sourceUrl!==prefix+spec.name || !header || !expected ||
      !['sourceUrl','documentSha256','headerTextSha256'].every(k=>header[k]===expected[k]) ||
      header.sourceUrl!==prefix+spec.accession+'-index.html' || typeof header.headerText!=='string' ||
      hash(header.headerText)!==header.headerTextSha256) return 'csgp_ferg_original_index_binding_mismatch';
  const text=header.headerText;
  if(text.match(/Filing Date (\d{4}-\d{2}-\d{2})/)?.[1]!==spec.availableAt ||
      !new RegExp(`CIK\\s*:\\s*${spec.cik}\\b`).test(text) || !text.includes(spec.accession) ||
      !text.includes('Form 10-K') || !text.includes(spec.name)) return 'csgp_ferg_original_index_semantics_mismatch';
  return null;
}
