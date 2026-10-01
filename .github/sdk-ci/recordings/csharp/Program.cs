using System.Globalization;
using System.IO.Compression;
using System.Numerics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Extensions.DependencyInjection;
using Reacon.Sdk.Api;
using Reacon.Sdk.Client;
using Reacon.Sdk.Extensions;
using Reacon.Sdk.Model;

static void Check(bool value, string message) { if (!value) throw new Exception(message); }
static (BigInteger, BigInteger) Number(string text) {
    var parts=text.ToLowerInvariant().Split('e');
    var power=parts.Length==2?BigInteger.Parse(parts[1],CultureInfo.InvariantCulture):BigInteger.Zero;
    var point=parts[0].IndexOf('.');
    if(point>=0)power-=parts[0].Length-point-1;
    var value=BigInteger.Parse(parts[0].Replace(".",""),CultureInfo.InvariantCulture);
    if(value==0)return (BigInteger.Zero,BigInteger.Zero);
    while(value%10==0){value/=10;power++;}
    return (value,power);
}
static bool Equal(JsonElement a,JsonElement b) {
    if(a.ValueKind!=b.ValueKind)return false;
    return a.ValueKind switch {
        JsonValueKind.Number=>Number(a.GetRawText())==Number(b.GetRawText()),
        JsonValueKind.Array=>a.GetArrayLength()==b.GetArrayLength()&&a.EnumerateArray().Zip(b.EnumerateArray()).All(x=>Equal(x.First,x.Second)),
        JsonValueKind.Object=>a.EnumerateObject().Count()==b.EnumerateObject().Count()&&a.EnumerateObject().All(p=>b.TryGetProperty(p.Name,out var v)&&Equal(p.Value,v)),
        JsonValueKind.String=>a.GetString()==b.GetString() || (a.GetString()!.Contains('T')&&b.GetString()!.Contains('T')&&DateTimeOffset.TryParse(a.GetString(),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out var x)&&DateTimeOffset.TryParse(b.GetString(),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out var y)&&x==y),
        _=>a.GetRawText()==b.GetRawText()
    };
}
Check(Number("0")==Number("0.0")&&Number("9007199254740993")==Number("9007199254740993.0")&&Number("9007199254740993")!=Number("9007199254740992.0"),"Exact numeric comparison");
var packageVersion=Environment.GetEnvironmentVariable("REACON_SDK_PACKAGE_VERSION") ?? throw new Exception("Missing SDK version");
var targetFramework=Environment.GetEnvironmentVariable("REACON_DOTNET_TFM") ?? "net10.0";
Check(targetFramework is "net8.0" or "net10.0","Unexpected target framework");
Check(Environment.Version.Major==(targetFramework=="net8.0"?8:10),"Consumer rolled forward to a different runtime major");
var assembly=typeof(IEmailsApi).Assembly;
using(var archive=ZipFile.OpenRead($"/results/artifacts/Reacon.Sdk.{packageVersion}.nupkg")) {
    using var dll=archive.GetEntry($"lib/{targetFramework}/Reacon.Sdk.dll")!.Open();
    Check(SHA256.HashData(dll).SequenceEqual(SHA256.HashData(File.ReadAllBytes(assembly.Location))),"Loaded assembly differs from NuGet package");
    using var nuspec=archive.Entries.Single(x=>x.FullName.EndsWith(".nuspec")).Open();
    var metadata=XDocument.Load(nuspec);
    Check(metadata.Descendants().Single(x=>x.Name.LocalName=="version").Value==packageVersion,"Package version");
    Check(metadata.Descendants().Single(x=>x.Name.LocalName=="license").Value=="Apache-2.0","Package license");
    using var license=new StreamReader(archive.GetEntry("LICENSE")!.Open());
    Check(license.ReadToEnd().Contains("Apache License"),"License text is missing");
    Check(archive.GetEntry("README.md")!=null,"Package README is missing");
}
using(var assets=JsonDocument.Parse(File.ReadAllText("/results/consumer/obj/project.assets.json")))
    Check(assets.RootElement.GetProperty("libraries").GetProperty($"Reacon.Sdk/{packageVersion}").GetProperty("type").GetString()=="package","SDK resolved as source instead of package");
File.WriteAllText("/results/runtime.json",JsonSerializer.Serialize(new{targetFramework,runtime=Environment.Version.ToString(),
    framework=System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
    architecture=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),
    loadedAssemblySha256=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(assembly.Location))).ToLowerInvariant(),
    assemblyMatchedRetainedPackage=true,packageVersion}));
using var cases=JsonDocument.Parse(File.ReadAllText(Environment.GetEnvironmentVariable("REACON_CASES_FILE")!));
var results=new List<object>();var passed=0;
foreach(var item in cases.RootElement.EnumerateArray()) {
    var id=item.GetProperty("id").GetString()!;
    try {
        var record=item.GetProperty("record");var request=record.GetProperty("request");var expected=record.GetProperty("response");
        var services=new ServiceCollection();services.AddLogging();
        services.AddApi(config=>config.AddTokens(request.GetProperty("authentication").GetString()=="none"?new MissingToken():new ApiKeyToken("recording-csharp",ClientUtils.ApiKeyHeader.X_API_Key,prefix:""))
            .AddApiHttpClients(builder: builder=>builder.AddHttpMessageHandler(()=>new FixtureHandler(Environment.GetEnvironmentVariable("REACON_TEST_URL")+"/"+id))));
        using var provider=services.BuildServiceProvider();
        var options=provider.GetRequiredService<JsonSerializerOptionsProvider>().Options;
        if (id==cases.RootElement[0].GetProperty("id").GetString()) {
            var populatedBody=cases.RootElement.EnumerateArray().Single(x=>x.GetProperty("id").GetString()=="getMailPortfolio--synthetic-team").GetProperty("record").GetProperty("response").GetProperty("body");
            foreach(var portfolioJson in new[]{"{\"portfolio\":null,\"teams\":[],\"suppressions\":[],\"future\":{\"items\":[1,null]}}",populatedBody.GetRawText()}) {
                using var expectedPortfolio=JsonDocument.Parse(portfolioJson);
                var portfolio=JsonSerializer.Deserialize<MailGetPortfolioResponse200>(portfolioJson,options)!;
                bool empty=expectedPortfolio.RootElement.GetProperty("portfolio").ValueKind==JsonValueKind.Null;
                Check((portfolio.MailGetPortfolioResponse200AnyOf!=null)==empty && (portfolio.MailGetPortfolioResponse200AnyOf1!=null)!=empty,"Portfolio selected both or incorrect alternatives");
                Check(Equal(JsonSerializer.SerializeToElement(portfolio,options),expectedPortfolio.RootElement),"Portfolio alternatives duplicated or lost fields");
            }
            foreach(var invalid in new[]{"{}","{\"portfolio\":17,\"teams\":[],\"suppressions\":[]}","{\"portfolio\":null,\"teams\":[{}],\"suppressions\":[]}","{\"portfolio\":null,\"teams\":[],\"suppressions\":[{}]}"}) {
                bool rejected=false;
                try{JsonSerializer.Deserialize<MailGetPortfolioResponse200>(invalid,options);}catch(Exception error)when(error is ArgumentException or JsonException){rejected=true;}
                Check(rejected,"Malformed portfolio alternative accepted");
            }
            var ambiguous=JsonSerializer.Deserialize<MailGetPortfolioResponse200>(populatedBody.GetRawText(),options)!;
            ambiguous.MailGetPortfolioResponse200AnyOf=JsonSerializer.Deserialize<MailGetPortfolioResponse200AnyOf>("{\"portfolio\":null,\"teams\":[],\"suppressions\":[]}",options)!;
            bool ambiguousRejected=false;
            try{JsonSerializer.SerializeToElement(ambiguous,options);}catch(JsonException){ambiguousRejected=true;}
            Check(ambiguousRejected,"Ambiguous portfolio serialization accepted");
        }
        var absent=JsonSerializer.SerializeToElement(new UpdateLeadRequest(),options);
        Check(absent.EnumerateObject().Count()==0,"Omitted patch fields were injected");
        var explicitNull=JsonSerializer.SerializeToElement(new UpdateLeadRequest(personFirstName:new Option<string?>(null)),options);
        Check(explicitNull.GetProperty("person_first_name").ValueKind==JsonValueKind.Null,"Explicit null lost");
        var domain=JsonSerializer.Deserialize<MailGetTrackingDomainResponse200>("{\"domain\":null}",options)!;
        Check(JsonSerializer.SerializeToElement(domain,options).GetProperty("domain").ValueKind==JsonValueKind.Null,"Required null lost");
        var future=JsonSerializer.SerializeToElement(new{connections=Array.Empty<object>(),future=(object?)null,nested=new{items=new[]{1,2}}});
        var open=JsonSerializer.Deserialize<IntegrationConnectionList>(future.GetRawText(),options)!;
        Check(Equal(JsonSerializer.SerializeToElement(open,options),future),"Unknown object fields were lost");
        foreach(var invalid in new[]{"{}","{\"domain\":17}"}) {
            bool rejected=false;
            try{JsonSerializer.Deserialize<MailGetTrackingDomainResponse200>(invalid,options);}catch(Exception error)when(error is ArgumentException or JsonException){rejected=true;}
            Check(rejected,"Malformed/missing required nullable field accepted");
        }
        var apiType=assembly.GetType("Reacon.Sdk.Api.I"+item.GetProperty("apiClass").GetString())!;
        var api=provider.GetRequiredService(apiType);
        var operation=record.GetProperty("operationId").GetString()!;
        var method=apiType.GetMethod(char.ToUpperInvariant(operation[0])+operation[1..]+"Async")!;
        var arguments=method.GetParameters().Select(parameter=> {
            if(parameter.ParameterType==typeof(CancellationToken))return (object)CancellationToken.None;
            JsonElement value=default;
            if(item.TryGetProperty("requestModel",out var model)&&parameter.Name==char.ToLowerInvariant(model.GetString()![0])+model.GetString()![1..])value=request.GetProperty("body");
            else item.GetProperty("parameters").TryGetProperty(parameter.Name!,out value);
            if(value.ValueKind==JsonValueKind.Undefined)return parameter.ParameterType.IsValueType?Activator.CreateInstance(parameter.ParameterType):null;
            var optional=parameter.ParameterType.IsGenericType&&parameter.ParameterType.GetGenericTypeDefinition()==typeof(Option<>);
            var type=optional?parameter.ParameterType.GetGenericArguments()[0]:parameter.ParameterType;
            var decoded=JsonSerializer.Deserialize(value.GetRawText(),type,options);
            return optional?Activator.CreateInstance(parameter.ParameterType,decoded):decoded;
        }).ToArray();
        var csv=operation=="exportLeads"&&request.GetProperty("body").GetProperty("format").GetString()=="csv";
        if(csv) {
            bool rejected=false;
            try{await (Task)method.Invoke(api,arguments)!;}catch(Exception error){var cause=error is TargetInvocationException?error.InnerException!:error;rejected=cause is ArgumentException&&cause.Message.Contains("ExportLeadsCsvAsync");}
            Check(rejected,"JSON export did not reject CSV before sending");
            var exportBody=(ExportLeadsRequest)arguments[1]!;exportBody.Format=ExportLeadsRequest.FormatEnum.Json;
            var csvText=await ((ILeadsApi)api).ExportLeadsCsvAsync((string)arguments[0]!,exportBody);
            Check(exportBody.Format==ExportLeadsRequest.FormatEnum.Json,"CSV helper mutated the caller's request");
            Check(csvText==expected.GetProperty("body").GetString(),"CSV text differs");
            results.Add(new{id,passed=true});passed++;continue;
        }
        var task=(Task)method.Invoke(api,arguments)!;await task;
        var response=(IApiResponse)task.GetType().GetProperty("Result")!.GetValue(task)!;
        Check((int)response.StatusCode==expected.GetProperty("status").GetInt32(),"HTTP status differs");
        if((int)response.StatusCode==204) {
            Check(response.RawContent==string.Empty && expected.GetProperty("body").ValueKind==JsonValueKind.Null,"Bodyless response contains content");
            Check((bool)response.GetType().GetProperty("IsNoContent")!.GetValue(response)!,"Missing native NoContent status");
            results.Add(new{id,passed=true});passed++;continue;
        }
        var decoder=(int)response.StatusCode switch {200=>"Ok",201=>"Created",400=>"BadRequest",401=>"Unauthorized",402=>"PaymentRequired",422=>"UnprocessableContent",404=>"NotFound",409=>"Conflict",412=>"PreconditionFailed",_=>throw new Exception("Add explicit status decoder")};
        var body=response.GetType().GetMethod(decoder,Type.EmptyTypes)!.Invoke(response,null);
        var actual=JsonSerializer.SerializeToElement(body,body?.GetType()??typeof(object),options);
        Check(Equal(actual,expected.GetProperty("body")),"Decoded response differs: "+actual.GetRawText());
        results.Add(new{id,passed=true});passed++;
    }catch(Exception error){results.Add(new{id,passed=false,error=(error is TargetInvocationException?error.InnerException??error:error).ToString()});}
}
File.WriteAllText(Environment.GetEnvironmentVariable("REACON_RESULTS_FILE")!,JsonSerializer.Serialize(results,new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"{passed}/{cases.RootElement.GetArrayLength()} recorded responses passed through C# methods");
foreach(var result in results){var json=JsonSerializer.SerializeToElement(result);if(!json.GetProperty("passed").GetBoolean())Console.Error.WriteLine(json.GetRawText());}
return passed==cases.RootElement.GetArrayLength()?0:1;

sealed class MissingToken:ApiKeyToken {
    public MissingToken():base("",ClientUtils.ApiKeyHeader.X_API_Key,prefix:""){}
    public override void UseInHeader(HttpRequestMessage request){}
}


sealed class FixtureHandler(string target) : DelegatingHandler {
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
        var original = request.RequestUri!;
        if (original.Scheme != "https" || original.Host != "api.reacon.io") throw new InvalidOperationException("SDK changed its fixed API origin");
        var fixture = new Uri(target);
        if (fixture.Host != "127.0.0.1") throw new InvalidOperationException("Loopback fixtures only");
        request.RequestUri = new Uri(target.TrimEnd('/') + original.PathAndQuery);
        return base.SendAsync(request, cancellationToken);
    }
}
