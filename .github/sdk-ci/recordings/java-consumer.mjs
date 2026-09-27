import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function prepareJavaConsumer(source,cases,output,packageVersion){
 const operations={};
 for(const item of new Map(cases.map(item=>[item.record.operationId,item])).values()){
  const api=await readFile(resolve(source,'src/main/java/io/reacon/sdk/api',item.apiClass+'.java'),'utf8');
  const match=api.match(new RegExp(`public [^\\n]+ ${item.record.operationId}\\(([^\\n]*)\\) throws ApiException \\{`));
  if(!match)throw new Error('Review Java operation signature: '+item.record.operationId);
  const declaration=match[1].replace(/@javax\.annotation\.\w+\s*/g,'');
  const parts=[];let start=0,depth=0;
  for(let i=0;i<declaration.length;i++){if(declaration[i]==='<')depth++;if(declaration[i]==='>')depth--;if(declaration[i]===','&&depth===0){parts.push(declaration.slice(start,i));start=i+1;}}
  if(declaration.trim())parts.push(declaration.slice(start));
  operations[item.record.operationId]=parts.map(part=>{const name=part.trim().match(/ (\w+)$/)?.[1];if(!name)throw new Error('Review Java parameter: '+part);return name;});
 }
 await writeFile(resolve(output,'operations.json'),JSON.stringify(operations));
 await writeFile(resolve(output,'consumer-pom.xml'),`<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>io.reacon.conformance</groupId><artifactId>recording-consumer</artifactId><version>0.0.0</version><dependencies><dependency><groupId>io.reacon</groupId><artifactId>reacon-java</artifactId><version>${packageVersion}</version></dependency></dependencies></project>`);
}
