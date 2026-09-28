use reacon_sdk::{
    apis::{
        self,
        configuration::{ApiKey, Configuration},
        Error,
    },
    models,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};

fn decode<T: DeserializeOwned>(value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|error| error.to_string())
}
fn snake(value: &str) -> String {
    let mut out = String::new();
    for (i, ch) in value.chars().enumerate() {
        if ch.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(ch.to_ascii_lowercase());
        } else {
            out.push(ch);
        }
    }
    out
}
fn parameter(item: &Value, name: &str) -> Value {
    item["parameters"]
        .as_object()
        .and_then(|values| values.iter().find(|(key, _)| snake(key) == name))
        .map(|(_, value)| value.clone())
        .unwrap_or(Value::Null)
}
fn finish<T: Serialize, E>(result: Result<T, Error<E>>, item: &Value) -> Result<Value, String> {
    let expected = item["record"]["response"]["status"]
        .as_u64()
        .ok_or("Missing status")?;
    match result {
        Ok(value) => {
            if expected >= 400 {
                return Err("Expected HTTP error".into());
            }
            serde_json::to_value(value).map_err(|error| error.to_string())
        }
        Err(Error::ResponseError(error)) => {
            if expected < 400 || u64::from(error.status.as_u16()) != expected {
                return Err(format!("Unexpected HTTP error {}", error.status));
            }
            for header in ["x-request-id", "retry-after"] {
                if let Some(value) = item["record"]["response"]["headers"][header].as_str() {
                    if error.headers.get(header).and_then(|v| v.to_str().ok()) != Some(value) {
                        return Err(format!("Missing response header {header}"));
                    }
                }
            }
            serde_json::from_str(&error.content).map_err(|error| error.to_string())
        }
        Err(error) => Err(error.to_string()),
    }
}
include!("dispatch.rs");

// JSON has one number type. Compare exact decimal values so 0 and 0.0 agree,
// without coercing large integers to f64 and hiding precision loss.
fn number_key(value: &serde_json::Number) -> (bool, String, i32) {
    let text = value.to_string();
    let mut parts = text.split(['e', 'E']);
    let mantissa = parts.next().unwrap();
    let exponent = parts.next().map(|v| v.parse::<i32>().unwrap()).unwrap_or(0);
    let negative = mantissa.starts_with('-');
    let mantissa = mantissa.trim_start_matches('-');
    let fractional = mantissa.split('.').nth(1).map(str::len).unwrap_or(0) as i32;
    let mut digits = mantissa.replace('.', "").trim_start_matches('0').to_owned();
    let mut scale = exponent - fractional;
    if digits.is_empty() {
        return (false, "0".into(), 0);
    }
    while digits.ends_with('0') {
        digits.pop();
        scale += 1;
    }
    (negative, digits, scale)
}
fn equal_json(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => number_key(a) == number_key(b),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equal_json(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(key, a)| b.get(key).is_some_and(|b| equal_json(a, b)))
        }
        _ => a == b,
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let archive: Value = serde_json::from_slice(&std::fs::read("/results/package.json")?)?;
    let directory = archive["directory"]
        .as_str()
        .ok_or("Missing packaged crate path")?;
    let metadata: Value = serde_json::from_slice(&std::fs::read("/results/cargo-metadata.json")?)?;
    let package = metadata["packages"]
        .as_array()
        .ok_or("Missing Cargo metadata")?
        .iter()
        .find(|p| p["name"] == "reacon-sdk")
        .ok_or("SDK missing from resolved packages")?;
    assert_eq!(
        package["manifest_path"],
        json!(format!("{directory}/Cargo.toml"))
    );
    assert_eq!(package["version"], std::env::var("REACON_SDK_PACKAGE_VERSION")?);
    assert_eq!(package["license"], "Apache-2.0");
    assert_eq!(
        package["repository"],
        "https://github.com/reacon-io/reacon-rust"
    );
    assert!(std::fs::read_to_string(format!("{directory}/LICENSE"))?.contains("Apache License"));
    assert!(equal_json(&json!(0), &json!(0.0)));
    assert!(equal_json(&json!(1000), &serde_json::from_str("1e3")?));
    assert!(!equal_json(
        &serde_json::from_str("9007199254740993")?,
        &serde_json::from_str("9007199254740992.0")?
    ));
    let patch: models::UpdateLeadRequest =
        serde_json::from_value(json!({"company_addresses":null,"person_first_name":null}))?;
    assert_eq!(
        serde_json::to_value(patch)?,
        json!({"company_addresses":null,"person_first_name":null})
    );
    let nullable: models::MailGetTrackingDomainResponse200 =
        serde_json::from_value(json!({"domain":null}))?;
    assert!(nullable.domain.is_none());
    assert_eq!(serde_json::to_value(nullable)?, json!({"domain":null}));
    assert!(serde_json::from_value::<models::MailGetTrackingDomainResponse200>(json!({})).is_err());
    assert!(
        serde_json::from_value::<models::MailGetTrackingDomainResponse200>(json!({"domain":{}}))
            .is_err()
    );
    let cases: Vec<Value> =
        serde_json::from_slice(&std::fs::read(std::env::var("REACON_CASES_FILE")?)?)?;
    let mut results = Vec::new();
    for item in &cases {
        let id = item["id"].as_str().ok_or("Missing case ID")?;
        let mut config = Configuration::new();
        config.base_path = format!("{}/{}", std::env::var("REACON_TEST_URL")?, id);
        if item["record"]["request"]["authentication"] != "none" {
            config.api_key = Some(ApiKey {
                prefix: None,
                key: "recording-rust".into(),
            });
        }
        let result = dispatch(&config, item).await.and_then(|actual| {
            if equal_json(&actual, &item["record"]["response"]["body"]) {
                Ok(())
            } else {
                Err(format!("Decoded response differs: {actual}"))
            }
        });
        match result {
            Ok(()) => results.push(json!({"id":id,"passed":true})),
            Err(error) => results.push(json!({"id":id,"passed":false,"error":error})),
        }
    }
    std::fs::write(
        std::env::var("REACON_RESULTS_FILE")?,
        serde_json::to_vec_pretty(&results)?,
    )?;
    let passed = results
        .iter()
        .filter(|value| value["passed"] == true)
        .count();
    println!(
        "{passed}/{} recorded responses passed through Rust methods",
        results.len()
    );
    for result in results.iter().filter(|value| value["passed"] != true) {
        eprintln!("{}", result);
    }
    if passed != results.len() {
        std::process::exit(1);
    }
    Ok(())
}
