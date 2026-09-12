import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolveUserDataPaths } from '../server/userDataPaths.js';
import { backupUserData, restoreUserData, discoverUserDatabases } from '../server/userDataBackup.js';

// Environment secrets only. No credentials in argv, stdout or public endpoints.
try {
  const {values,positionals}=parseArgs({allowPositionals:true,options:{output:{type:'string'},input:{type:'string'}}});
  const [command]=positionals;
  if(positionals.length!==1 || !['inventory','backup','restore'].includes(command)) throw new Error('usage');
  let result;
  if(command==='inventory') {
    const entries=discoverUserDatabases(resolveUserDataPaths());
    result={status:'inventory_only',databases:entries.length,kinds:entries.reduce((a,e)=>(a[e.kind]=(a[e.kind]||0)+1,a),{}),durability:'single_host; off_host_backup_must_be_verified'};
  } else {
    if(!values.output || !path.isAbsolute(values.output)) throw new Error('absolute output required');
    const options={output:values.output,key:process.env.USER_DATA_BACKUP_KEY};
    result=command==='backup'
      ? await backupUserData({...options,paths:resolveUserDataPaths(),keyId:process.env.USER_DATA_BACKUP_KEY_ID||'v1'})
      : await restoreUserData({...options,input:values.input});
  }
  console.log(JSON.stringify(result,null,2));
} catch {
  console.error('User data maintenance failed. Check paths, schema, backup key and integrity. No existing database was replaced. Commands: inventory; backup --output <new-absolute-directory>; restore --input <backup-directory> --output <new-absolute-directory>.');
  process.exitCode=1;
}

