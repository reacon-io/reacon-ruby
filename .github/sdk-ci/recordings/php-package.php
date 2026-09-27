<?php
// Exercise a Composer-installed dist archive, not an autoloader from the source tree.
function command(array $args, string $cwd): void {
    $process=proc_open($args,[0=>STDIN,1=>STDOUT,2=>STDERR],$pipes,$cwd);
    if (!is_resource($process) || proc_close($process)!==0) throw new RuntimeException('Package command failed');
}
function removeTree(string $directory): void {
    if (!is_dir($directory)) return;
    foreach(new FilesystemIterator($directory) as $entry) {
        if($entry->isDir() && !$entry->isLink()) removeTree($entry->getPathname());
        else unlink($entry->getPathname());
    }
    rmdir($directory);
}
$source=getenv('SDK_DIRECTORY');
$root='/cache/recording-package';
removeTree($root); mkdir($root,0777,true);
command(['composer','archive','--format=zip','--dir='.$root,'--file=reacon-sdk','--no-interaction'],$source);
$archive='/results/artifacts/reacon-sdk-'.getenv('REACON_SDK_PACKAGE_VERSION').'.zip';
if(!copy($root.'/reacon-sdk.zip',$archive)) throw new RuntimeException('Cannot retain Composer archive');
$zip=new ZipArchive();
if($zip->open($archive)!==true) throw new RuntimeException('Cannot read Composer archive');
if($zip->getFromName('composer.json')!==file_get_contents($source.'/composer.json')) throw new RuntimeException('Manifest changed in archive');
if(!str_contains($zip->getFromName('LICENSE') ?: '', 'Apache License')) throw new RuntimeException('Missing Apache license');
$zip->close();
$package=json_decode(file_get_contents($source.'/composer.json'),true,512,JSON_THROW_ON_ERROR);
// Repository metadata supplies the tag version; the SDK manifest stays versionless.
$package['version']=getenv('REACON_SDK_PACKAGE_VERSION');
$package['dist']=['type'=>'zip','url'=>'file://'.$archive,'shasum'=>sha1_file($archive)];
$consumer=$root.'/consumer';mkdir($consumer);
file_put_contents($consumer.'/composer.json',json_encode([
    'name'=>'reacon-conformance/consumer',
    'repositories'=>[['type'=>'package','package'=>$package]],
    'require'=>[$package['name']=>$package['version']],
    'config'=>['allow-plugins'=>false],
],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
command(['composer','install','--no-interaction','--no-progress','--no-dev','--no-scripts'],$consumer);
$autoload=$consumer.'/vendor/autoload.php'; require $autoload;
if(Composer\InstalledVersions::getPrettyVersion($package['name'])!==$package['version']) throw new RuntimeException('Wrong installed SDK version');
$installed=(new ReflectionClass(Reacon\Sdk\Configuration::class))->getFileName();
if(!str_starts_with(realpath($installed),realpath($consumer.'/vendor/reacon-io/sdk').'/')) throw new RuntimeException('SDK was loaded from outside installed package');
putenv('REACON_PHP_AUTOLOAD='.$autoload);
command(['php','/suite/php.php'],$consumer);
