// Fail closed: browser privacy tests must never upload to a hosted project.
export function testDatabaseUrl(value=process.env.TEST_SUPABASE_URL??'http://127.0.0.1:54321'){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Browser tests require a loopback Supabase URL; remote projects are forbidden.');
 return url.origin;
}
// Opt-in only: map and layout specs may use local file data. Any other value keeps the test database.
export function browserDataMode(value=process.env.HISAAB_BROWSER_DATA_MODE){return value==='local'?'local':'supabase';}
