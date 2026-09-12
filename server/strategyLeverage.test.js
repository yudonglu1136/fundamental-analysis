import test from 'node:test';
import a from 'node:assert/strict';
import {financeStrategy,leverageRules} from './strategyLeverage.js';
const near=(x,y)=>a.ok(Math.abs(x-y)<1e-10,`${x} != ${y}`);
const cfg=(multiple=1.5)=>({multiple,annualRate:.04,reset:'filing'});
const target=(date,weight=1,ticker='A')=>({executionDate:date,weights:[{ticker,weight}]});
const gross=(rows,contributions=[])=>({ok:true,equity:rows.map(([date,value])=>({date,value})),quarterContributions:contributions});
test('only fixed 4% filing-reset leverage from 1 to 2 is accepted',()=>{
 a.deepEqual(leverageRules(),cfg(1));
 for(const v of [cfg(0),cfg(2.01),cfg(NaN),cfg('1.5'),{...cfg(),annualRate:.05},{...cfg(),reset:'daily'},[]])a.throws(()=>leverageRules(v));
});
test('flat prices charge calendar-day interest including a weekend, then capitalize',()=>{
 const g=gross([['2026-01-02',1],['2026-01-05',1],['2026-01-06',1]]);
 const r=financeStrategy(g,[target('2026-01-02')],cfg(),0),i1=.5*.04*3/365,i2=(.5+i1)*.04/365;
 near(r.equity.at(-1).value,1-i1-i2);near(r.financing.interestPaid,i1+i2);
 a.deepEqual(r.financing.rows.map(x=>x.days),[0,3,1]);near(r.trades[0].borrowed,.5);
});
test('cash offsets debt; leverage scales risky positions, not cash or a phantom loan',()=>{
 const r=financeStrategy(gross([['2026-01-02',1],['2026-01-05',1.04]]),[target('2026-01-02',.4)],cfg(2),0);
 near(r.trades[0].borrowed,0);near(r.trades[0].cash,.2);near(r.financing.interestPaid,0);near(r.equity[1].value,1.08);
});
test('one-times zero-cost is identical; losses and gains scale before financing',()=>{
 const g=gross([['2026-01-02',1],['2026-01-05',1.1],['2026-01-06',.8]]),t=[target('2026-01-02')];
 a.deepEqual(financeStrategy(g,t,cfg(1),0).equity,g.equity);
 const r=financeStrategy(g,t,cfg(2),0);
 near(r.equity.at(-1).value,1+2*(.8-1)-r.financing.interestPaid);
});
test('entry costs use actual leveraged traded value and self-financing post-fee NAV',()=>{
 const r=financeStrategy(gross([['2026-01-02',1],['2026-01-05',1]]),[target('2026-01-02')],cfg(2),10),t=r.trades[0];
 near(t.navAfter,1/1.002);near(t.tradedNotional,2*t.navAfter);near(t.cost,.001*t.tradedNotional);near(t.navAfter+t.cost,1);near(t.borrowed,t.navAfter);
});
test('disclosure reset repays accrued interest and resizes debt; both trade legs reconcile',()=>{
 const g=gross([['2026-01-02',1],['2026-01-05',1.1],['2026-01-06',1.21]],[{contributions:[{ticker:'A',endingWeight:1}]}]);
 const r=financeStrategy(g,[target('2026-01-02'),target('2026-01-05',1,'B')],cfg(),10),[x,y]=r.trades;
 const accrued=x.borrowed*.04*3/365,pre=x.navAfter*1.15-accrued;
 near(y.navBefore,pre);near(y.tradedNotional,x.navAfter*1.5*1.1+y.navAfter*1.5);
 near(y.cost,.001*y.tradedNotional);near(y.navAfter+y.cost,pre);near(y.borrowed,.5*y.navAfter);
 near(r.equity.at(-1).value,y.navAfter*1.15-y.borrowed*.04/365);
});
test('cash-settled actions do not charge a fictitious liquidation sale',()=>{
 const g=gross([['2026-01-02',1],['2026-01-05',1]],[{contributions:[{ticker:'A',endingWeight:1,corporateActionResolution:{considerationType:'cash'}}]}]);
 const r=financeStrategy(g,[target('2026-01-02'),target('2026-01-05',1,'B')],cfg(),10),t=r.trades[1];
 near(t.tradedNotional,1.5*t.navAfter);
});
test('stock conversions use successor identity rather than charging a new sale and purchase',()=>{
 const g=gross([['2026-01-02',1],['2026-01-05',1]],[{contributions:[{ticker:'A',endingWeight:1,corporateActionResolution:{considerationType:'stock',successorTicker:'B'}}]}]);
 const r=financeStrategy(g,[target('2026-01-02'),target('2026-01-05',1,'B')],cfg(),0);
 near(r.trades[1].tradedNotional,1.5*(.5*.04*3/365));
});
test('exhausted equity fails closed without a zero-loss floor or fabricated full curve',()=>{
 const r=financeStrategy(gross([['2026-01-02',1],['2026-01-05',.4]]),[target('2026-01-02')],cfg(2),0);
 a.equal(r.status,'blocked');a.equal(r.failure.code,'leverage_equity_exhausted');a.deepEqual(r.equity,[]);a.equal(r.metrics,null);
});
