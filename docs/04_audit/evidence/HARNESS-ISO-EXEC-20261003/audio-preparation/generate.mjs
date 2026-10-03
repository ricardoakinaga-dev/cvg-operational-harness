import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const version=spawnSync('espeak-ng',['--version'],{encoding:'utf8'});if(version.status!==0)throw Error('missing_tts');
const refs=JSON.parse(fs.readFileSync('/input/references.json','utf8'));const results=[];
for(let i=0;i<refs.length;i++){const ref=refs[i];const voice=['pt-br','pt-br+f3','pt-br+m3'][i%3];const speed=[145,155,135][i%3];const command=['-v',voice,'-s',String(speed),'-w',`/output/${ref.id}.wav`,'-f',`/input/texts/${ref.id}.txt`];const result=spawnSync('espeak-ng',command,{encoding:'utf8'});if(result.status!==0)throw Error(`tts_failed:${ref.id}:${result.stderr}`);results.push({id:ref.id,voice,wordsPerMinute:speed,command,status:'SYNTHESIZED_NOT_TRANSCRIBED'});}
console.log(JSON.stringify({engineVersion:version.stdout.trim(),network:'none',source:'Synthetic scripts, no person recording',results}));
