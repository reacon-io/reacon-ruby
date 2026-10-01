<?php
require getenv('REACON_PHP_AUTOLOAD') ?: getenv('SDK_DIRECTORY') . '/vendor/autoload.php';
require array_values(array_filter([__DIR__.'/../fixed-origin/http.php', __DIR__.'/fixed-origin/http.php', '/fixed-origin/http.php'], 'is_file'))[0];
use Reacon\Sdk\{Configuration, ObjectSerializer, ApiException};
function snake($s) { return strtolower(preg_replace('/([a-z0-9])([A-Z])/', '$1_$2', $s)); }
function canonical($value, $expected) {
    // PHP represents typed JSON maps as associative arrays, including [] for
    // an empty map. Preserve list order and compare every object key/value.
    if (is_object($expected) && (is_object($value) || is_array($value))) {
        $properties=is_object($value) ? get_object_vars($value) : $value;
        ksort($properties); $result=[];
        foreach($properties as $key=>$entry) $result[$key]=canonical($entry, property_exists($expected,(string)$key) ? $expected->{$key} : null);
        return (object)$result;
    }
    if (is_array($value) && is_array($expected)) {
        foreach($value as $key=>$entry) $value[$key]=canonical($entry,$expected[$key]??null);
        return $value;
    }
    if (is_string($value) && preg_match('/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$/D',$value)) return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\\TH:i:s.u\\Z');
    return $value;
}
function check($condition,$message) { if (!$condition) throw new Exception($message); }
// Exercise the asynchronous native void path as well as the recorded sync call.
$voidClient=new GuzzleHttp\Client(['handler'=>new GuzzleHttp\Handler\MockHandler([new GuzzleHttp\Psr7\Response(204)])]);
$voidApi=new Reacon\Sdk\Api\WebhooksApi($voidClient,new Configuration());
[$voidValue,$voidStatus]=$voidApi->deleteSegmentInstallationAsyncWithHttpInfo('00000000-0000-4000-8000-000000000001')->wait();
check($voidValue===null && $voidStatus===204,'Native async bodyless operation attempted JSON decoding');
$patch=ObjectSerializer::deserialize((object)['person_first_name'=>null],'Reacon\\Sdk\\Model\\UpdateLeadRequest');
check(json_encode(ObjectSerializer::sanitizeForSerialization($patch))==='{"person_first_name":null}','Patch omitted/null distinction lost');
$nullable=new Reacon\Sdk\Model\MailGetTrackingDomainResponse200(['domain'=>null]);
check($nullable->valid(),'Required explicit null must be valid');
check(!(new Reacon\Sdk\Model\MailGetTrackingDomainResponse200())->valid(),'Missing required nullable field must be invalid');
foreach ([[], ['0'=>'value'], ['key'=>'value']] as $map) {
    check(json_encode(ObjectSerializer::sanitizeForSerialization($map,'array<string,string>'))===json_encode((object)$map),'Typed map became a JSON array');
}
check(json_encode(ObjectSerializer::sanitizeForSerialization([],'string[]'))==='[]','Empty list became an object');
$mapInput=(object)['email'=>'sdk@example.invalid','idempotencyKey'=>'synthetic-regression-1','attributes'=>new stdClass()];
$mapModel=ObjectSerializer::deserialize($mapInput,Reacon\Sdk\Model\ProductToolRequestInput::class);
check(ObjectSerializer::sanitizeForSerialization($mapModel)->attributes instanceof stdClass,'Nested empty attributes became an array');
// Preserve JSON object/list identity in requests as well as responses.
$rawCases=json_decode(file_get_contents(getenv('REACON_CASES_FILE')),false,512,JSON_THROW_ON_ERROR);
$rawById=[]; foreach($rawCases as $raw) $rawById[$raw->id]=$raw;
foreach (['{}','{"limit":2,"listId":"00000000-0000-4000-8000-000000000001"}','{"domain":"example.invalid"}','{"email":"sdk@example.invalid","idempotencyKey":"synthetic-regression-1","firstName":"SDK"}'] as $json) {
    $input=json_decode($json);
    $value=ObjectSerializer::deserialize($input,Reacon\Sdk\Model\ProductToolRequestInput::class);
    check(json_encode(canonical(ObjectSerializer::sanitizeForSerialization($value),$input))===json_encode(canonical($input,$input)), 'Product input union lost fields');
}
foreach (['null','[]','{"unknown":true}','{"domain":"example.invalid","unknown":true}','{"recipientId":"00000000-0000-4000-8000-000000000001"}'] as $json) {
    $rejected=false;
    try { ObjectSerializer::deserialize(json_decode($json),Reacon\Sdk\Model\ProductToolRequestInput::class); } catch (InvalidArgumentException $error) { $rejected=true; }
    check($rejected,'Invalid product input accepted: '.$json);
}
foreach ([Reacon\Sdk\Model\MailCadenceNode::class,Reacon\Sdk\Model\MailPostCadencesRequestNodesInner::class] as $model) {
    foreach (['{"id":"start","name":"Start","kind":"start","nextNodeId":"stop"}','{"id":"stop","name":"Stop","kind":"stop","outcome":"Fixture"}'] as $json) {
        $input=json_decode($json);$value=ObjectSerializer::deserialize($input,$model);
        check(json_encode(canonical(ObjectSerializer::sanitizeForSerialization($value),$input))===json_encode(canonical($input,$input)), 'Cadence variant lost fields');
    }
    foreach (['{"id":"start","kind":"start"}','{"id":"node","kind":"unknown"}'] as $json) {
        $rejected=false;try { ObjectSerializer::deserialize(json_decode($json),$model); } catch (InvalidArgumentException $error) { $rejected=true; }
        check($rejected,'Invalid cadence accepted');
    }
}
// Preserve both primitive branches, including false, through native models.
foreach ([true,false,'true','false'] as $flag) {
    $wire=(object)['emails'=>['test@example.invalid'],'onlyIfFree'=>$flag];
    $model=ObjectSerializer::deserialize($wire,Reacon\Sdk\Model\BatchVerificationRequest::class);
    check($model->getOnlyIfFree()===$flag,'Primitive flag changed type/value');
    check(ObjectSerializer::sanitizeForSerialization($model)->onlyIfFree===$flag,'Primitive flag lost on serialization');
    $native=new Reacon\Sdk\Model\BatchVerificationRequest(['emails'=>['test@example.invalid'],'only_if_free'=>$flag]);
    check($native->getOnlyIfFree()===$flag,'Native constructor changed flag');
    $native->setOnlyIfFree($flag);check($native->getOnlyIfFree()===$flag,'Native setter changed flag');
}
foreach ([null,0,1,[],new stdClass(),'TRUE','yes',''] as $flag) {
    foreach (['decode','constructor','setter'] as $mode) {
        $rejected=false;try {
            if($mode==='decode')ObjectSerializer::deserialize($flag,Reacon\Sdk\Model\BatchVerificationRequestOnlyIfFree::class);
            elseif($mode==='constructor')new Reacon\Sdk\Model\BatchVerificationRequest(['emails'=>['test@example.invalid'],'only_if_free'=>$flag]);
            else (new Reacon\Sdk\Model\BatchVerificationRequest(['emails'=>['test@example.invalid']]))->setOnlyIfFree($flag);
        }catch(InvalidArgumentException $error){$rejected=true;}
        check($rejected,'Invalid primitive flag accepted: '.$mode);
    }
}
$withoutFlag=new Reacon\Sdk\Model\BatchVerificationRequest(['emails'=>['test@example.invalid']]);
check(!property_exists(ObjectSerializer::sanitizeForSerialization($withoutFlag),'onlyIfFree'),'Absent flag became a value');
$cases=json_decode(file_get_contents(getenv('REACON_CASES_FILE')),true,512,JSON_THROW_ON_ERROR); $results=[];
foreach($cases as $item) {
    try {
        $config=new Configuration();
        if($item['record']['request']['authentication']!=='none') $config->setApiKey('X-API-Key','recording-php');
        $class='Reacon\\Sdk\\Api\\'.$item['apiClass']; $api=new $class(fixtureHttp(getenv('REACON_TEST_URL').'/'.$item['id']),$config);
        $params=[];foreach($item['parameters'] as $key=>$value) $params[snake($key)]=$value;
        if(array_key_exists('body',$item['record']['request'])) $params[snake($item['requestModel'])]=ObjectSerializer::deserialize($rawById[$item['id']]->record->request->body,'Reacon\\Sdk\\Model\\'.$item['requestModel']);
        $csv=$item['record']['operationId']==='exportLeads' && ($item['record']['request']['body']['format']??null)==='csv';
        if($csv) {
            $rejected=false;
            try {$api->exportLeads($params['team_id'],$params['export_leads_request']);}
            catch(InvalidArgumentException $error){$rejected=str_contains($error->getMessage(),'exportLeadsCsv');}
            check($rejected,'JSON export must reject CSV before sending');
        }
        $method=new ReflectionMethod($api,$csv?'exportLeadsCsv':$item['record']['operationId']); $args=[];
        foreach($method->getParameters() as $param){$name=$param->getName();if(array_key_exists($name,$params))$args[]=$params[$name];elseif($param->isDefaultValueAvailable())$args[]=$param->getDefaultValue();else throw new Exception('Missing argument '.$name);}
        try {
            $value=$method->invokeArgs($api,$args);
        } catch(ApiException $error) {
            check($error->getCode()===$item['record']['response']['status'],'Unexpected error status '.$error->getCode());
            check($error->getCode()>=400,'Unexpected HTTP error: '.$error->getCode().' '.$error->getMessage());
            check(json_decode((string)$error->getResponseBody(),true)===$item['record']['response']['body'],'Error body differs');
            $results[]=['id'=>$item['id'],'passed'=>true];continue;
        }
        check($item['record']['response']['status']<400,'Expected HTTP error');
        $actual=ObjectSerializer::sanitizeForSerialization($value);
        // Compare JSON values, including object/array distinction and explicit null.
        $expected=json_decode(json_encode($item['record']['response']['body'],JSON_THROW_ON_ERROR));
        // PHP associative decoding loses empty-object identity; reload expected from original JSON.
        $expected=$rawById[$item['id']]->record->response->body;
        check(json_encode(canonical($actual,$expected),JSON_THROW_ON_ERROR)===json_encode(canonical($expected,$expected),JSON_THROW_ON_ERROR),'Decoded response differs: '.json_encode($actual));
        $results[]=['id'=>$item['id'],'passed'=>true];
    }catch(Throwable $error){$results[]=['id'=>$item['id'],'passed'=>false,'error'=>$error->getMessage()];}
}
file_put_contents(getenv('REACON_RESULTS_FILE'),json_encode($results,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
$passed=count(array_filter($results,fn($r)=>$r['passed']));echo "$passed/".count($results)." recorded responses passed through PHP methods\n";
foreach($results as $result) if(!$result['passed']) fwrite(STDERR,json_encode($result,JSON_THROW_ON_ERROR)."\n");
exit($passed===count($results)?0:1);
