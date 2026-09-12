import test from 'node:test';
import assert from 'node:assert/strict';
import {valuationDecision} from './strategyLab.js';
import {strategyModelTickers} from './strategyValuationLinks.js';

// Synthetic fixtures only. The audited production rule is never inferred from
// these numbers, nor are fixture models written to a serving database.
const holding={ticker:'GOOG',cusip:'02079K107',priceSymbol:'GOOG',identityResolved:true};
const model={date:'2021-10-27',currency:'USD',fairValue:125,sourceTicker:'GOOGL',version:'fixture'};
function fixture() {
  return {models:new Map([['GOOGL',[model]]]),prices:new Map([
    ['GOOG',{currency:'USD',points:new Map([['2021-12-31',145]])}],
    ['GOOGL',{currency:'USD',points:new Map([['2021-12-31',200]])}],
  ])};
}
test('GOOG uses the reviewed company model, its own exact-day close, and retains dated source evidence',()=>{
  const {models,prices}=fixture(),out=valuationDecision(holding,'2021-12-31',models,prices);
  assert.equal(out.status,'comparable');assert.equal(out.price,145);assert.equal(out.fairValue,125);
  assert.ok(Math.abs(out.premium-.16)<1e-12);assert.equal(out.modelTicker,'GOOGL');
  assert.equal(out.modelDate,model.date);assert.equal(out.valuationLink.availableAt,'2016-02-11');
  assert.equal(models.has('GOOG'),false);assert.equal(prices.get('GOOGL').points.get('2021-12-31'),200);
  assert.deepEqual([...strategyModelTickers(['GOOG','AAPL'])],['GOOG','GOOGL','AAPL']);
});
test('linking requires exact reviewed claim, price identity, source ticker and pre-decision evidence',()=>{
  const {models,prices}=fixture();
  for(const h of [{...holding,cusip:'02079K305'},{...holding,cusip:null},{...holding,identityResolved:false},
    {...holding,priceSymbol:'GOOGL'},{...holding,ticker:'BRK.A'}])
    assert.equal(valuationDecision(h,'2021-12-31',models,prices).status,'no_model');
  for(const bad of [{...model,date:'2022-01-03'},{...model,sourceTicker:null},{...model,sourceTicker:'OTHER'},{...model,currency:'GBP'}]) {
    models.set('GOOGL',[bad]);assert.equal(valuationDecision(holding,'2021-12-31',models,prices).status,'no_model');
  }
  models.set('GOOGL',[{...model,date:'2015-10-20'}]);
  assert.equal(valuationDecision(holding,'2016-02-10',models,prices).status,'no_model');
});
test('own-class models take precedence, including unusable/stale values; linked models retain ordinary gates',()=>{
  const {models,prices}=fixture();
  models.set('GOOG',[{...model,fairValue:100}]);
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).fairValue,100);
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).valuationLink,undefined);
  models.set('GOOG',[{...model,fairValue:0}]);
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).status,'no_model');
  models.set('GOOG',[{...model,date:'2018-10-27'}]);
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).status,'stale_model');
  models.delete('GOOG');models.set('GOOGL',[{...model,date:'2018-10-27'}]);
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).status,'stale_model');
  models.set('GOOGL',[model]);prices.get('GOOG').currency=null;
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).status,'currency_unverified');
  prices.get('GOOG').currency='USD';prices.get('GOOG').points.clear();
  assert.equal(valuationDecision(holding,'2021-12-31',models,prices).status,'comparison_price_missing','never borrow the GOOGL close');
});
