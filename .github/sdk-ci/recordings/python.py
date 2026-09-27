import asyncio
import importlib
import importlib.metadata
import json
import os
import re
import sys
from datetime import datetime, date, timezone
from reacon_sdk import ApiClient, Configuration
from reacon_sdk.exceptions import ApiException
from reacon_sdk.sync_helper import run_sync
from reacon_sdk.models.mail_get_tracking_domain_response200 import MailGetTrackingDomainResponse200
from reacon_sdk.models.update_lead_request import UpdateLeadRequest
from pydantic import ValidationError

def snake(value):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', value).lower()

def wire(value):
    if isinstance(value, list): return [wire(v) for v in value]
    if isinstance(value, dict): return {k:wire(v) for k,v in value.items()}
    if hasattr(value, 'to_dict'): return wire(value.to_dict())
    if isinstance(value, datetime): return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    if isinstance(value, date): return value.isoformat()
    return value

async def main():
    assert importlib.metadata.version('reacon-sdk')==os.environ['REACON_SDK_PACKAGE_VERSION']
    sync='--sync' in sys.argv
    language='python-sync' if sync else 'python'
    assert UpdateLeadRequest.from_dict({'tags':[]}).to_dict()=={'tags':[]}
    assert UpdateLeadRequest.from_dict({'person_first_name':None}).to_dict()=={'person_first_name':None}
    assert MailGetTrackingDomainResponse200.from_dict({'domain':None}).to_dict()=={'domain':None}
    try: MailGetTrackingDomainResponse200.from_dict({})
    except ValidationError: pass
    else: raise AssertionError('Missing required nullable field was accepted')
    async def invoke(method, **params):
        return await asyncio.to_thread(method, **params) if sync else await method(**params)
    with open(os.environ['REACON_CASES_FILE']) as f: cases=json.load(f)
    results=[]
    for item in cases:
        client=None
        try:
            config=Configuration(host=os.environ['REACON_TEST_URL']+'/'+item['id'], api_key={'ApiKey':'recording-'+language} if item['record']['request']['authentication'] != 'none' else {})
            client=ApiClient(config)
            api_type=getattr(importlib.import_module('reacon_sdk.api.'+snake(item['apiClass'])),item['apiClass'])
            api=api_type(client)
            params={snake(k):v for k,v in item['parameters'].items()}
            if 'body' in item['record']['request']:
                model_name=item['requestModel']
                model=getattr(importlib.import_module('reacon_sdk.models.'+snake(model_name)),model_name)
                params[snake(model_name)]=model.from_dict(item['record']['request']['body'])
            try:
                method=getattr(api,snake(item['record']['operationId'])+('_sync' if sync else ''))
                if item['record']['response']['mediaType']=='text/csv':
                    try: await invoke(method, **params)
                    except ValueError as error: assert 'export_leads_csv' in str(error)
                    else: raise AssertionError('JSON method accepted CSV format')
                    value=await invoke(api.export_leads_csv_sync if sync else api.export_leads_csv, **params)
                else: value=await invoke(method, **params)
            except ApiException as error:
                assert error.status==item['record']['response']['status'], f'Unexpected error status {error.status}'
                assert error.status >= 400
                assert json.loads(error.body)==item['record']['response']['body']
            else:
                assert item['record']['response']['status']<400,'Expected HTTP error'
                actual=wire(value)
                assert actual==item['record']['response']['body'], f'Decoded response differs: {actual!r}'
            results.append({'id':item['id'],'passed':True})
        except Exception as error:
            results.append({'id':item['id'],'passed':False,'error':str(error)})
        finally:
            if client:
                if sync: await asyncio.to_thread(run_sync, client.close())
                else: await client.close()
    with open(os.environ['REACON_RESULTS_FILE'],'w') as f: json.dump(results,f,indent=2)
    print(f'{sum(r["passed"] for r in results)}/{len(results)} recorded responses passed through {language} generated methods')
    if not all(r['passed'] for r in results): raise SystemExit(1)
asyncio.run(main())
