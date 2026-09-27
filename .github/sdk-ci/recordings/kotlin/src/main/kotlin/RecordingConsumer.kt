import io.reacon.sdk.kotlin.infrastructure.*
import io.reacon.sdk.kotlin.models.*
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import java.io.File
import java.lang.reflect.InvocationTargetException
import java.time.OffsetDateTime
import java.util.jar.JarFile
import kotlin.reflect.KParameter
import kotlin.reflect.full.memberFunctions
import kotlin.reflect.full.primaryConstructor
import kotlin.reflect.jvm.javaType

val mapper = Serializer.jacksonObjectMapper
fun equalJson(a: JsonNode,b: JsonNode):Boolean = when {
    a.isNumber && b.isNumber -> a.decimalValue().compareTo(b.decimalValue())==0
    a.isArray && b.isArray -> a.size()==b.size() && (0 until a.size()).all{equalJson(a[it],b[it])}
    a.isObject && b.isObject -> a.fieldNames().asSequence().toSet()==b.fieldNames().asSequence().toSet() && a.fieldNames().asSequence().all{equalJson(a[it],b[it])}
    a.isTextual && b.isTextual && a.asText().matches(Regex("\\d{4}-\\d{2}-\\d{2}T.*")) && b.asText().matches(Regex("\\d{4}-\\d{2}-\\d{2}T.*")) -> runCatching{OffsetDateTime.parse(a.asText()).toInstant()==OffsetDateTime.parse(b.asText()).toInstant()}.getOrElse{a==b}
    else -> a==b
}
fun main(){
    val location=ApiClient::class.java.protectionDomain.codeSource.location.path
    val version=System.getenv("REACON_SDK_PACKAGE_VERSION")
    check(java.nio.file.Files.mismatch(java.nio.file.Path.of(location),java.nio.file.Path.of("/results/artifacts/reacon-kotlin-$version.jar")) == -1L) { "Retained Kotlin artifact differs from installed JAR" }
    System.getenv("REACON_EXPECTED_JAVA_MAJOR")?.let { major ->
        check(System.getProperty("java.specification.version") == major) { "Unexpected Kotlin JVM runtime" }
        val proof = mapper.createObjectNode()
            .put("specificationVersion", System.getProperty("java.specification.version"))
            .put("runtime", System.getProperty("java.runtime.version"))
            .put("packageVersion", version).put("installedJarMatchesRetained", true)
        File("/results/runtime.json").writeText(mapper.writeValueAsString(proof))
    }
    JarFile("/results/artifacts/reacon-kotlin-$version-javadoc.jar").use { docs ->
        val pages=docs.entries().asSequence().map { it.name }.toList()
        check(pages.count { it.endsWith(".html") } > 100 && pages.any { it.contains("-leads-api/") }) { "Kotlin documentation JAR lacks generated API documentation" }
    }
    check(location.endsWith("/reacon-kotlin-${System.getenv("REACON_SDK_PACKAGE_VERSION")}.jar") && !location.contains("/work/")){"SDK did not load from a dependency JAR: $location"}
    JarFile(location).use { jar ->
        val license = jar.getJarEntry("META-INF/LICENSE") ?: error("SDK JAR has no license")
        check(jar.getInputStream(license).bufferedReader().use { it.readText() }.contains("Apache License"))
    }
    val absent = UpdateLeadRequest()
    check(mapper.valueToTree<JsonNode>(absent).isEmpty)
    val explicitNull = absent.copy().withExplicitNulls("person_first_name")
    check(equalJson(mapper.valueToTree(explicitNull), mapper.readTree("{\"person_first_name\":null}")))
    check(mapper.valueToTree<JsonNode>(absent).isEmpty) { "copy() shared mutable presence state" }
    check(mapper.valueToTree<JsonNode>(explicitNull.copy().withOmittedFields("person_first_name")).isEmpty)
    val cleared = UpdateLeadRequest(personFirstName="Synthetic").copy(personFirstName=null)
    check(equalJson(mapper.valueToTree(cleared), mapper.readTree("{\"person_first_name\":null}")))
    val nullable = mapper.readValue("{\"domain\":null}", MailGetTrackingDomainResponse200::class.java)
    check(equalJson(mapper.valueToTree(nullable.copy()), mapper.readTree("{\"domain\":null}")))
    for (invalid in listOf("{}", "{\"domain\":17}")) {
        check(runCatching { mapper.readValue(invalid, MailGetTrackingDomainResponse200::class.java) }.isFailure)
    }
    check(runCatching { nullable.withOmittedFields("domain") }.isFailure)
    check(runCatching { absent.withExplicitNulls("unknown") }.isFailure)
    val extraJson = mapper.readTree("{\"connections\":[],\"future\":null,\"future_values\":[1,2]}")
    val extra = mapper.treeToValue(extraJson, IntegrationConnectionList::class.java)
    check(equalJson(mapper.valueToTree(extra), extraJson)) { "Unknown fields or empty collections lost" }
    check(equalJson(mapper.readTree("0"),mapper.readTree("0.0")))
    check(!equalJson(mapper.readTree("9007199254740993"),mapper.readTree("9007199254740992.0")))
    val cases=mapper.readTree(File(System.getenv("REACON_CASES_FILE")))
    val results=mapper.createArrayNode()
    for(item in cases){
        val result=mapper.createObjectNode().put("id",item["id"].asText())
        try{
            val record=item["record"];val request=record["request"];val response=record["response"]
            val clazz=Class.forName("io.reacon.sdk.kotlin.apis."+item["apiClass"].asText()).kotlin
            val constructor=clazz.primaryConstructor!!
            val api=constructor.callBy(mapOf(constructor.parameters.first{it.name=="basePath"} to (System.getenv("REACON_TEST_URL")+"/"+item["id"].asText()))) as ApiClient
            if(request["authentication"].asText()!="none")api.apiKey["X-API-Key"]="recording-kotlin"
            val operation=record["operationId"].asText()
            val method=clazz.memberFunctions.single{it.name==operation}
            val arguments=mutableMapOf<KParameter,Any?>()
            for(parameter in method.parameters){
                if(parameter.kind==KParameter.Kind.INSTANCE){arguments[parameter]=api;continue}
                var value=item["parameters"][parameter.name]
                if(request.has("body")&&item.has("requestModel")&&parameter.name==item["requestModel"].asText().replaceFirstChar{it.lowercase()})value=request["body"]
                if(value==null&&parameter.isOptional)continue
                arguments[parameter]=if(value==null)null else mapper.convertValue<Any?>(value,mapper.typeFactory.constructType(parameter.type.javaType))
            }
            val csv = operation == "exportLeads" && request["body"]?.get("format")?.asText() == "csv"
            val value=try{
                if (csv) {
                    val rejected = runCatching { method.callBy(arguments) }.exceptionOrNull()
                    check((rejected as? InvocationTargetException)?.cause.let { it is IllegalArgumentException && it.message?.contains("exportLeadsCsv") == true }) { "JSON export did not reject CSV before sending" }
                    val helper = clazz.memberFunctions.single { it.name == "exportLeadsCsv" }
                    val original = (arguments.entries.single { it.key.name == "exportLeadsRequest" }.value as ExportLeadsRequest).copy(format=ExportLeadsRequest.Format.JSON)
                    val helperArguments = helper.parameters.associateWith { parameter ->
                        when {
                            parameter.kind == KParameter.Kind.INSTANCE -> api
                            parameter.name == "exportLeadsRequest" -> original
                            else -> arguments.entries.single { it.key.name == parameter.name }.value
                        }
                    }
                    helper.callBy(helperArguments).also { check(original.format == ExportLeadsRequest.Format.JSON) { "CSV helper mutated caller request" } }
                } else method.callBy(arguments)
            }catch(invocation:InvocationTargetException){throw invocation.cause?:invocation}
            check(response["status"].asInt()<400){"Expected HTTP error"}
            val actual=mapper.valueToTree<JsonNode>(value)
            check(equalJson(actual,response["body"])){"Decoded response differs: $actual"}
            result.put("passed",true)
        }catch(error:Throwable){
            val status=when(error){is ClientException->error.statusCode;is ServerException->error.statusCode;else->0}
            val response=when(error){is ClientException->error.response;is ServerException->error.response;else->null}
            val body=when(response){is ClientError<*>->response.body;is ServerError<*>->response.body;else->null}
            val expected=item["record"]["response"]
            val decoded=runCatching{if(body is String)mapper.readTree(body) else mapper.valueToTree<JsonNode>(body)}.getOrNull()
            if(status>=400&&status==expected["status"].asInt()&&decoded!=null&&equalJson(decoded,expected["body"]))result.put("passed",true)
            else result.put("passed",false).put("error",error.toString())
        }
        results.add(result)
    }
    File(System.getenv("REACON_RESULTS_FILE")).writeText(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(results))
    val passed=results.count{it["passed"].asBoolean()}
    println("$passed/${cases.size()} recorded responses passed through Kotlin methods")
    if(passed!=cases.size())kotlin.system.exitProcess(1)
}
