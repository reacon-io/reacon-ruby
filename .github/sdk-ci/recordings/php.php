<?php
require getenv('REACON_PHP_AUTOLOAD') ?: getenv('SDK_DIRECTORY') . '/vendor/autoload.php';
use Reacon\Sdk\{Configuration, ObjectSerializer, ApiException};
function snake($s) { return strtolower(preg_replace('/([a-z0-9])([A-Z])/', '$1_$2', $s)); }
function canonical($value) {
    if (is_object($value)) { $properties=get_object_vars($value); ksort($properties); return (object)array_map('canonical',$properties); }
    if (is_array($value)) return array_map('canonical',$value);
    if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D',$value)) return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z');
    return $value;
}
function check($condition,$message) { if (!$condition) throw new Exception($message); }
$patch=ObjectSerializer::deserialize((object)['person_first_name'=>null],'Reacon\\Sdk\\Model\\UpdateLeadRequest');
check(json_encode(ObjectSerializer::sanitizeForSerialization($patch))==='{"person_first_name":null}','Patch omitted/null distinction lost');
$nullable=new Reacon\Sdk\Model\MailGetTrackingDomainResponse200(['domain'=>null]);
check($nullable->valid(),'Required explicit null must be valid');
check(!(new Reacon\Sdk\Model\MailGetTrackingDomainResponse200())->valid(),'Missing required nullable field must be invalid');
$cases=json_decode(file_get_contents(getenv('REACON_CASES_FILE')),true,512,JSON_THROW_ON_ERROR); $results=[];
foreach($cases as $item) {
    try {
        $config=(new Configuration())->setHost(getenv('REACON_TEST_URL').'/'.$item['id']);
        if($item['record']['request']['authentication']!=='none') $config->setApiKey('X-API-Key','recording-php');
        $class='Reacon\\Sdk\\Api\\'.$item['apiClass']; $api=new $class(null,$config);
        $params=[];foreach($item['parameters'] as $key=>$value) $params[snake($key)]=$value;
        if(array_key_exists('body',$item['record']['request'])) $params[snake($item['requestModel'])]=ObjectSerializer::deserialize(json_decode(json_encode($item['record']['request']['body'])),'Reacon\\Sdk\\Model\\'.$item['requestModel']);
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
        $rawCases=json_decode(file_get_contents(getenv('REACON_CASES_FILE')));
        foreach($rawCases as $raw) if($raw->id===$item['id']) $expected=$raw->record->response->body;
        check(json_encode(canonical($actual),JSON_THROW_ON_ERROR)===json_encode(canonical($expected),JSON_THROW_ON_ERROR),'Decoded response differs: '.json_encode($actual));
        $results[]=['id'=>$item['id'],'passed'=>true];
    }catch(Throwable $error){$results[]=['id'=>$item['id'],'passed'=>false,'error'=>$error->getMessage()];}
}
file_put_contents(getenv('REACON_RESULTS_FILE'),json_encode($results,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
$passed=count(array_filter($results,fn($r)=>$r['passed']));echo "$passed/".count($results)." recorded responses passed through PHP methods\n";
foreach($results as $result) if(!$result['passed']) fwrite(STDERR,json_encode($result,JSON_THROW_ON_ERROR)."\n");
exit($passed===count($results)?0:1);
