import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const snake = value => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
export async function prepareRustConsumer(source, cases, output, packageVersion) {
  const arms=[];
  for(const item of new Map(cases.map(item=>[item.record.operationId,item])).values()) {
    const module=snake(item.apiClass),method=snake(item.record.operationId);
    const api=await readFile(resolve(source,'src/apis',module+'.rs'),'utf8');
    const signature=new RegExp(`pub async fn ${method}\\(configuration: &configuration::Configuration(?:, params: (\\w+))?\\)`);
    const match=api.match(signature);
    if(!match)throw new Error('Review Rust consumer operation signature: '+method);
    const params=match[1];let prepare='';
    if(params) {
      const block=api.match(new RegExp(`pub struct ${params} \\{([\\s\\S]*?)\\n\\}`))?.[1];
      if(!block)throw new Error('Missing Rust parameter struct: '+params);
      const fields=[...block.matchAll(/^    pub (\w+): ([^\n,]+(?:,[^\n]+)?)/gm)];
      if(fields.length!==(block.match(/\bpub /g)??[]).length)throw new Error('Unparsed Rust parameters');
      prepare=`let params = apis::${module}::${params} {\n${fields.map(([,name])=>`${name}: decode(${name===snake(item.requestModel??'')?'item["record"]["request"]["body"].clone()':`parameter(item, ${JSON.stringify(name)})`})?,`).join('\n')}\n};`;
    }
    const csv=method==='export_leads'?`if item["record"]["response"]["mediaType"] == "text/csv" {
      match apis::leads_api::export_leads(cfg, params.clone()).await {
        Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::InvalidInput && error.to_string().contains("export_leads_csv") => {},
        _ => return Err("JSON export must reject CSV before sending".into()),
      }
      let mut params = params;
      params.export_leads_request.format = Some(models::export_leads_request::Format::Json);
      return finish(apis::leads_api::export_leads_csv(cfg, params).await, item);
    }`:'';
    arms.push(`${JSON.stringify(item.record.operationId)} => { ${prepare}\n${csv}\nfinish(apis::${module}::${method}(cfg${params?', params':''}).await, item) },`);
  }
  const directory=resolve(output,'consumer');await mkdir(resolve(directory,'src'),{recursive:true});
  await writeFile(resolve(directory,'src/dispatch.rs'),`async fn dispatch(cfg: &Configuration, item: &Value) -> Result<Value, String> {\nmatch item["record"]["operationId"].as_str().ok_or("Missing operation")? {\n${arms.join('\n')}\nother => Err(format!("Unsupported operation: {other}")),\n}\n}\n`);
  await writeFile(resolve(directory,'src/main.rs'),(await readFile(new URL('./rust.rs',import.meta.url),'utf8'))+'\n#[cfg(test)] mod union_tests;\n');
  await writeFile(resolve(directory,'src/union_tests.rs'),await readFile(new URL('./rust-unions.rs',import.meta.url)));
  await writeFile(resolve(directory,'Cargo.toml'),`[package]\nname = "reacon-recording-consumer"\nversion = "0.0.0"\nedition = "2021"\npublish = false\n\n[dependencies]\nreacon-sdk = { path = "/cache/recording-crate/reacon-sdk-${packageVersion}" }\ntokio = { version = "1", features = ["macros", "rt-multi-thread"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n`);
}
