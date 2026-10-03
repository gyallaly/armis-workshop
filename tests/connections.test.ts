import { describe, expect, it } from 'vitest';
import { decodeFeedReports, feedWorking } from '../src/core/connections';
const report={id:'workers',status:'ok',checkedAt:100000,lastRecordAt:null,records:0,detail:'Source checked; idle'} as const;
describe('connection evidence',()=> {
  it('requires both live transport and fresh explicit successful source evidence',()=> {
    expect(feedWorking(undefined,true,100000)).toBe(false);
    expect(feedWorking(report,false,100000)).toBe(false);
    expect(feedWorking(report,true,100000)).toBe(true);
    expect(feedWorking(report,true,145001)).toBe(false);
    expect(feedWorking({...report,status:'error'},true,100000)).toBe(false);
  });
  it('accepts quiet healthy feeds but rejects duplicate, unknown and malformed reports',()=> {
    expect(decodeFeedReports([report],100000)).toEqual([report]);
    for(const bad of [[report,report],[{...report,id:'fictional'}],[{...report,checkedAt:130001}],[{...report,records:-1}],[{...report,lastRecordAt:100001}],[{...report,detail:'x'.repeat(501)}]]) expect(decodeFeedReports(bad,100000)).toBeNull();
  });
});
