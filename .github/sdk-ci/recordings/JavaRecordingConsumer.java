import io.reacon.sdk.*;
import com.google.gson.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.time.OffsetDateTime;
import java.util.*;

public class JavaRecordingConsumer {
    static final Gson GSON=JSON.getGson();
    static void check(boolean value,String message){if(!value)throw new IllegalStateException(message);}
    static byte[] readBytes(java.io.InputStream input)throws java.io.IOException {
        try(java.io.InputStream source=input;java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192];int count;while((count=source.read(buffer))!=-1)output.write(buffer,0,count);return output.toByteArray();
        }
    }
    static String readText(String path)throws java.io.IOException {return new String(Files.readAllBytes(Paths.get(path)),java.nio.charset.StandardCharsets.UTF_8);}
    static boolean equalJson(JsonElement a,JsonElement b){
        if(a.isJsonNull()||b.isJsonNull())return a.isJsonNull()&&b.isJsonNull();
        if(a.isJsonArray()&&b.isJsonArray()){
            JsonArray aa=a.getAsJsonArray();JsonArray bb=b.getAsJsonArray();if(aa.size()!=bb.size())return false;
            for(int i=0;i<aa.size();i++)if(!equalJson(aa.get(i),bb.get(i)))return false;return true;
        }
        if(a.isJsonObject()&&b.isJsonObject()){
            JsonObject aa=a.getAsJsonObject();JsonObject bb=b.getAsJsonObject();if(!aa.keySet().equals(bb.keySet()))return false;
            for(String key:aa.keySet())if(!equalJson(aa.get(key),bb.get(key)))return false;return true;
        }
        if(a.isJsonPrimitive()&&b.isJsonPrimitive()){
            JsonPrimitive aa=a.getAsJsonPrimitive();JsonPrimitive bb=b.getAsJsonPrimitive();
            if(aa.isNumber()&&bb.isNumber())return aa.getAsBigDecimal().compareTo(bb.getAsBigDecimal())==0;
            if(aa.isString()&&bb.isString()){
                String av=aa.getAsString(),bv=bb.getAsString();
                if(av.matches("\\d{4}-\\d{2}-\\d{2}T.*")&&bv.matches("\\d{4}-\\d{2}-\\d{2}T.*")){
                    try{return OffsetDateTime.parse(av).toInstant().equals(OffsetDateTime.parse(bv).toInstant());}catch(java.time.format.DateTimeParseException ignored){}
                }
            }
        }
        return a.equals(b);
    }
    public static void main(String[] args)throws Exception{
        String location=ApiClient.class.getProtectionDomain().getCodeSource().getLocation().getPath();
        String version=System.getenv("REACON_SDK_PACKAGE_VERSION");
        String expectedRuntime=System.getenv("REACON_EXPECTED_JAVA_MAJOR");
        String runtime=System.getProperty("java.specification.version");
        if(expectedRuntime!=null)check((runtime.startsWith("1.")?runtime.substring(2):runtime).equals(expectedRuntime),"Unexpected Java runtime");
        check(Arrays.equals(Files.readAllBytes(Paths.get(location)),Files.readAllBytes(Paths.get("/results/artifacts/reacon-java-"+version+".jar"))),"Retained Java artifact differs from installed JAR");
        check(location.equals("/cache/m2/io/reacon/reacon-java/"+System.getenv("REACON_SDK_PACKAGE_VERSION")+"/reacon-java-"+System.getenv("REACON_SDK_PACKAGE_VERSION")+".jar"),"SDK was not loaded from installed Maven JAR: "+location);
        JsonObject runtimeProof=new JsonObject();runtimeProof.addProperty("runtime",System.getProperty("java.version"));
        runtimeProof.addProperty("specificationVersion",runtime);runtimeProof.addProperty("packageVersion",version);
        runtimeProof.addProperty("installedJarMatchesRetained",true);
        Files.write(Paths.get("/results/runtime.json"),runtimeProof.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try(java.util.jar.JarFile jar=new java.util.jar.JarFile(location)){
            java.util.jar.JarEntry license=jar.getJarEntry("META-INF/LICENSE");check(license!=null,"Missing packaged SDK license");
            check(new String(readBytes(jar.getInputStream(license)),java.nio.charset.StandardCharsets.UTF_8).contains("Apache License"),"Wrong SDK license");
        }
        io.reacon.sdk.model.UpdateLeadRequest patch=GSON.fromJson("{\"person_first_name\":null,\"company_addresses\":null}",io.reacon.sdk.model.UpdateLeadRequest.class);
        check(equalJson(GSON.toJsonTree(patch),JsonParser.parseString("{\"person_first_name\":null,\"company_addresses\":null}")),"Patch null/omitted distinction lost");
        patch.unsetField("company_addresses");check(!patch.isFieldSet("company_addresses"),"Unset collection remains present");
        check(equalJson(GSON.toJsonTree(patch),JsonParser.parseString("{\"person_first_name\":null}")),"Unset collection serialized");
        patch.setCompanyAddresses(Collections.emptyList());check(patch.isFieldSet("company_addresses"),"Empty collection marked absent");
        check(equalJson(GSON.toJsonTree(patch),JsonParser.parseString("{\"person_first_name\":null,\"company_addresses\":[]}")),"Empty collection lost");
        io.reacon.sdk.model.MailGetTrackingDomainResponse200 nullable=GSON.fromJson("{\"domain\":null}",io.reacon.sdk.model.MailGetTrackingDomainResponse200.class);
        check(nullable.isFieldSet("domain")&&nullable.getDomain()==null,"Required null lost");
        for(String invalid:Arrays.asList("{}","{\"domain\":{}}")){
            boolean rejected=false;try{GSON.fromJson(invalid,io.reacon.sdk.model.MailGetTrackingDomainResponse200.class);}catch(RuntimeException expected){rejected=true;}
            check(rejected,"Missing or malformed nullable record accepted");
        }
        check(equalJson(JsonParser.parseString("0"),JsonParser.parseString("0.0")),"Equivalent numbers differ");
        check(!equalJson(JsonParser.parseString("9007199254740993"),JsonParser.parseString("9007199254740992.0")),"Large integer precision hidden");
        JsonArray cases=JsonParser.parseString(readText(System.getenv("REACON_CASES_FILE"))).getAsJsonArray();
        JsonObject operations=JsonParser.parseString(readText("/results/operations.json")).getAsJsonObject();
        JsonArray results=new JsonArray();int passed=0;
        for(JsonElement element:cases){
            JsonObject item=element.getAsJsonObject();JsonObject result=new JsonObject();result.addProperty("id",item.get("id").getAsString());
            try{
                JsonObject record=item.getAsJsonObject("record");JsonObject request=record.getAsJsonObject("request");JsonObject response=record.getAsJsonObject("response");
                ApiClient client=new ApiClient().setBasePath(System.getenv("REACON_TEST_URL")+"/"+item.get("id").getAsString());
                if(!request.get("authentication").getAsString().equals("none"))client.setApiKey("recording-java");
                Class<?> apiClass=Class.forName("io.reacon.sdk.api."+item.get("apiClass").getAsString());Object api=apiClass.getConstructor(ApiClient.class).newInstance(client);
                String operation=record.get("operationId").getAsString();JsonArray names=operations.getAsJsonArray(operation);
                Method method=Arrays.stream(apiClass.getMethods()).filter(m->m.getName().equals(operation)&&m.getParameterCount()==names.size()).findFirst().orElseThrow(()->new IllegalStateException("Missing operation"));
                Object[] values=new Object[names.size()];
                for(int i=0;i<names.size();i++){
                    String name=names.get(i).getAsString();JsonElement value=item.getAsJsonObject("parameters").get(name);
                    if(request.has("body")&&item.has("requestModel")){
                        String model=item.get("requestModel").getAsString();String bodyName=Character.toLowerCase(model.charAt(0))+model.substring(1);
                        if(name.equals(bodyName))value=request.get("body");
                    }
                    values[i]=value==null?null:GSON.fromJson(value,method.getGenericParameterTypes()[i]);
                }
                Object data;
                io.reacon.sdk.model.ExportLeadsRequest csvInput=null;
                if(response.get("mediaType").getAsString().equals("text/csv")){
                    boolean rejected=false;
                    try{method.invoke(api,values);}catch(InvocationTargetException error){rejected=error.getCause() instanceof ApiException&&error.getCause().getMessage().contains("exportLeadsCsv");}
                    check(rejected,"JSON export must reject CSV before sending");
                    csvInput=(io.reacon.sdk.model.ExportLeadsRequest)values[1];csvInput.setFormat(io.reacon.sdk.model.ExportLeadsRequest.FormatEnum.JSON);
                    method=apiClass.getMethod("exportLeadsCsv",String.class,io.reacon.sdk.model.ExportLeadsRequest.class);
                }
                try{data=method.invoke(api,values);}
                catch(InvocationTargetException invocation){
                    Throwable cause=invocation.getCause();
                    if(cause instanceof ApiException){
                        ApiException error=(ApiException)cause;
                        check(response.get("status").getAsInt()>=400&&error.getCode()==response.get("status").getAsInt(),"Unexpected HTTP status "+error.getCode()+": "+error.getMessage());
                        check(equalJson(JsonParser.parseString(error.getResponseBody()),response.get("body")),"Error body differs");
                        result.addProperty("passed",true);results.add(result);passed++;continue;
                    }
                    throw new IllegalStateException(cause);
                }
                check(response.get("status").getAsInt()<400,"Expected HTTP error");
                if(csvInput!=null)check(csvInput.getFormat()==io.reacon.sdk.model.ExportLeadsRequest.FormatEnum.JSON,"CSV helper mutated caller input");
                JsonElement actual=GSON.toJsonTree(data);
                check(equalJson(actual,response.get("body")),"Decoded response differs: "+actual);
                result.addProperty("passed",true);passed++;
            }catch(Exception error){result.addProperty("passed",false);result.addProperty("error",error.toString());}
            results.add(result);
        }
        Files.write(Paths.get(System.getenv("REACON_RESULTS_FILE")),new GsonBuilder().setPrettyPrinting().create().toJson(results).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        System.out.println(passed+"/"+cases.size()+" recorded responses passed through Java methods");
        if(passed!=cases.size())System.exit(1);
    }
}
