import crypto from 'node:crypto';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

/** Only two already-reviewed group policies, independent semantic/date check.
 * The caller binds complete original HTML and paragraph hashes in its registry.
 */
export function auditEarlyGroupCurrencyInference({ticker,sourceId,observedAt,proof,reviewed}) {
 const s={TSLA:['0001318605','2010-11-12','0001193125-10-259068','10-Q','d10q.htm','e014ec20c2e590055f051a0f','2011-02-15'],ABBV:['0001551152','2013-03-15','0001047469-13-002827','10-K','a2213529z10-k.htm','09d7e89471d35a5530129417','2013-04-26']}[ticker];
 const fail='exact_early_group_currency_inference_mismatch';
 if(!s || sourceId!==s[5] || observedAt!==s[6] || ['cik','availableAt','accession','form'].some((k,i)=>proof[k]!==s[i]) || proof.inference!==true || reviewed?.reviewClassification!=='analyst_inference' || !proof.reasoning || !proof.limitations || proof.quotes?.length!==3)return fail;
 const [policy,basis,confirmation]=proof.quotes;
 if(ticker==='TSLA') {
  if(!/For each of our foreign subsidiaries, the functional currency is the U\.S\. Dollar\./.test(policy) || !/monetary assets and liabilities.*re-measured to U\.S\. Dollars.*Non-monetary assets and liabilities.*historical U\.S\. Dollar exchange rates.*Revenues and expenses are re-measured at average U\.S\. Dollar monthly rates.*condensed consolidated statements of operations/.test(policy) || !/include the accounts of Tesla and its wholly owned subsidiaries.*inter-company transactions and balances have been eliminated in consolidation/.test(basis) || !/no components of comprehensive loss which are not included in net loss.*do not have any foreign currency translation adjustments.*functional currency of all our foreign subsidiaries is the U\.S\. Dollar/.test(confirmation))return fail;
 } else if(!/Foreign subsidiary earnings are translated into U\.S\. dollars using average exchange rates.*net assets of foreign subsidiaries are translated into U\.S\. dollars using current exchange rates.*recognized in other comprehensive income \(OCI\)/.test(policy) || !/combined financial statements have been prepared on a stand-alone basis.*Abbott's consolidated financial statements.*as if the former research-based pharmaceutical business of Abbott had been part of AbbVie.*All intracompany transactions and accounts have been eliminated/.test(basis) || !/On January 1, 2013, AbbVie became an independent company.*100 percent.*common stock of AbbVie.*AbbVie was incorporated in Delaware on April 10, 2012/.test(confirmation))return fail;
 const prefix=`https://www.sec.gov/Archives/edgar/data/${Number(s[0])}/${s[2].replaceAll('-','')}/`;
 const h=proof.filingDateEvidence,e=reviewed.filingDateEvidence;
 if(proof.sourceUrl!==prefix+s[4] || !h || !e || ['sourceUrl','documentSha256','headerTextSha256'].some(k=>h[k]!==e[k]) || h.sourceUrl!==prefix+s[2]+'-index.html' || sha(h.headerText)!==h.headerTextSha256 || h.headerText.match(/Filing Date (\d{4}-\d{2}-\d{2})/)?.[1]!==s[1] || !h.headerText.includes(s[2]) || !new RegExp('CIK\\s*:\\s*'+s[0]+'\\b').test(h.headerText) || !h.headerText.includes('Form '+s[3]) || !h.headerText.includes(s[4]))return 'original_early_group_filing_header_mismatch';
 return null;
}
